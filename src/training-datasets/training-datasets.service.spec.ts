import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { TrainingDatasetsService } from './training-datasets.service';
import { sha256 } from './training-dataset-format';
import { TrainingDatasetsController } from './training-datasets.controller';
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

const exportId = '10000000-0000-4000-8000-000000000001';
const exampleId = '10000000-0000-4000-8000-000000000002';
const image = Buffer.from('test-image');
const example = {
  id: exampleId,
  organization_id: 'org',
  dossier_id: 'dossier',
  document_id: 'document',
  consent_revision: 'revision',
  reviewed_at_utc: new Date('2026-10-08'),
  model_name: 'numind/NuExtract3',
  mime_type: 'image/png',
  object_prefix: `examples/${exampleId}`,
  source_sha256: sha256(image),
  label_sha256: sha256('{}'),
  expected_json: { document_type: 'invoice', total_incl_tax: 1191 },
  template_json: { total_incl_tax: 'verbatim-string' },
  instructions: 'Extract visible fields.',
  document_kind: 'invoice',
};

function setup() {
  const query = jest.fn(
    (sql: string, parameters?: unknown[]): Promise<unknown[]> => {
      void sql;
      void parameters;
      return Promise.resolve([]);
    },
  );
  const db = {
    query,
    transaction: jest.fn(async (work: (manager: unknown) => Promise<unknown>) =>
      work({ query }),
    ),
  };
  const storage = {
    ensureReady: jest.fn(),
    readObject: jest.fn().mockResolvedValue(image),
    putObject: jest.fn(),
    putFile: jest.fn(),
    removeObject: jest.fn(),
    signedReadUrl: jest
      .fn()
      .mockResolvedValue('https://storage.invalid/read-only'),
  };
  const dossiers = { getAccessibleEntity: jest.fn() };
  const renderer = { renderPdf: jest.fn() };
  const service = new TrainingDatasetsService(
    db as unknown as DataSource,
    {} as ConfigService,
    storage,
    storage,
    dossiers as never,
    renderer as never,
  );
  return { service, query, db, storage, dossiers, renderer };
}

describe('private training datasets', () => {
  it('protects every platform dataset route with the platform admin guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      TrainingDatasetsController,
    ) as unknown[];
    expect(guards).toContain(PlatformAdminGuard);
  });

  it('refuses consent changes for a non-owner, even if they can validate documents', async () => {
    const { service, query, dossiers } = setup();
    await expect(
      service.updateConsent('org', 'dossier', 'worker', {
        enabled: true,
        authorizationReference: 'Client permission',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dossiers.getAccessibleEntity).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toContain("r.name = 'Propriétaire'");
  });

  it('defaults a dossier to no training authorization', async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce([{ id: 'owner' }]).mockResolvedValueOnce([]);
    expect(await service.consent('org', 'dossier', 'owner')).toMatchObject({
      enabled: false,
    });
  });

  it('does not create an export when no authorized samples exist', async () => {
    const { service, query } = setup();
    await expect(
      service.createExport('admin', { limit: 1000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('c.enabled');
    expect(sql).toContain('c.revision = e.consent_revision');
    expect(sql).toContain("j.status = 'VALIDEE'");
    expect(sql).toContain("issue->>'severity' = 'ERROR'");
    expect(sql).toContain("d.malware_scan_status = 'SAIN'");
  });

  it('blocks downloads after a consent, deletion or approval change', async () => {
    const { service, query, storage } = setup();
    query
      .mockResolvedValueOnce([
        {
          id: exportId,
          status: 'READY',
          example_ids: [exampleId],
          expires_at_utc: new Date(Date.now() + 60000),
          object_key: 'exports/test.zip',
        },
      ])
      .mockResolvedValueOnce([]);
    await expect(service.download('admin', exportId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storage.signedReadUrl).not.toHaveBeenCalled();
  });

  it('audits a permitted download and limits the storage link to one minute', async () => {
    const { service, query, storage } = setup();
    query
      .mockResolvedValueOnce([
        {
          id: exportId,
          status: 'READY',
          example_ids: [exampleId],
          expires_at_utc: new Date(Date.now() + 60000),
          object_key: 'exports/test.zip',
        },
      ])
      .mockResolvedValueOnce([example]);
    expect(await service.download('admin', exportId)).toMatchObject({
      expiresInSeconds: 60,
    });
    expect(storage.signedReadUrl).toHaveBeenCalledWith(
      'exports/test.zip',
      60,
      `fiscora-training-${exportId}.zip`,
    );
    expect(query.mock.calls.at(-1)?.[0]).toContain(
      'training.dataset.downloaded',
    );
  });

  it('exports actual page images, answers and schema in a valid ZIP, not raw PDFs', async () => {
    const { service, query, storage } = setup();
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.startsWith('SELECT e.*')
          ? [example]
          : sql.includes('RETURNING id')
            ? [{ id: exportId }]
            : [],
      ),
    );
    let zipContent: Buffer | undefined;
    storage.putFile.mockImplementation(async (_key: string, path: string) => {
      zipContent = await readFile(path);
    });
    await service['buildExport']({
      id: exportId,
      status: 'PROCESSING',
      example_ids: [exampleId],
      expires_at_utc: new Date(Date.now() + 60000),
      object_key: null,
    });
    expect(zipContent).toBeDefined();
    const zip = await JSZip.loadAsync(zipContent!);
    expect(
      await zip.file(`examples/${exampleId}/page-001.png`)!.async('nodebuffer'),
    ).toEqual(image);
    expect(
      JSON.parse(
        await zip.file(`examples/${exampleId}/expected.json`)!.async('string'),
      ),
    ).toEqual(example.expected_json);
    const sample = JSON.parse(
      (await zip.file('samples.jsonl')!.async('string')).trim(),
    ) as Record<string, unknown>;
    expect(sample.images).toEqual([`examples/${exampleId}/page-001.png`]);
    expect(sample).not.toHaveProperty('organization_id');
    expect(sample).not.toHaveProperty('reviewed_by_user_id');
    expect(storage.putFile).toHaveBeenCalledWith(
      `exports/${exportId}.zip`,
      expect.any(String),
      'application/zip',
    );
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it('renders all PDF pages in order into one reviewed example', async () => {
    const { service, query, storage, renderer } = setup();
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.startsWith('SELECT e.*')
          ? [{ ...example, mime_type: 'application/pdf' }]
          : sql.includes('RETURNING id')
            ? [{ id: exportId }]
            : [],
      ),
    );
    renderer.renderPdf
      .mockResolvedValueOnce({
        pageCount: 3,
        images: [
          { content: image, mimeType: 'image/jpeg', page: 1 },
          { content: image, mimeType: 'image/jpeg', page: 2 },
        ],
      })
      .mockResolvedValueOnce({
        pageCount: 3,
        images: [{ content: image, mimeType: 'image/jpeg', page: 3 }],
      });
    let zipContent: Buffer | undefined;
    storage.putFile.mockImplementation(async (_key: string, path: string) => {
      zipContent = await readFile(path);
    });
    await service['buildExport']({
      id: exportId,
      status: 'PROCESSING',
      example_ids: [exampleId],
      expires_at_utc: new Date(Date.now() + 60000),
      object_key: null,
    });
    const zip = await JSZip.loadAsync(zipContent!);
    const sample = JSON.parse(
      (await zip.file('samples.jsonl')!.async('string')).trim(),
    ) as { images: string[] };
    expect(sample.images).toEqual(
      [1, 2, 3].map((page) => `examples/${exampleId}/page-00${page}.jpg`),
    );
    expect(Object.keys(zip.files).some((path) => path.endsWith('.pdf'))).toBe(
      false,
    );
  });

  it('refuses corrupt stored originals without publishing an archive', async () => {
    const { service, query, storage } = setup();
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.startsWith('SELECT e.*')
          ? [{ ...example, source_sha256: 'corrupt' }]
          : [],
      ),
    );
    await service['buildExport']({
      id: exportId,
      status: 'PROCESSING',
      example_ids: [exampleId],
      expires_at_utc: new Date(Date.now() + 60000),
      object_key: null,
    });
    expect(storage.putFile).not.toHaveBeenCalled();
    expect(query.mock.calls.at(-1)?.[1]).toEqual([exportId, 'EXPORT_FAILED']);
  });

  it('removes an uploaded ZIP if its export expired or was withdrawn during upload', async () => {
    const { service, query, storage } = setup();
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.startsWith('SELECT e.*') ? [example] : []),
    );
    await service['buildExport']({
      id: exportId,
      status: 'PROCESSING',
      example_ids: [exampleId],
      expires_at_utc: new Date(Date.now() + 60000),
      object_key: null,
    });
    expect(storage.putFile).toHaveBeenCalled();
    expect(storage.removeObject).toHaveBeenCalledWith(
      `exports/${exportId}.zip`,
    );
  });
});
