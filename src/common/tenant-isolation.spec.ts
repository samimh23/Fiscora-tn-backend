// Security evidence: a user of one organization or dossier cannot reach the
// data of another, files are screened before storage and before access, and
// the assistant only retrieves approved passages of the requested dossier.
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { MalwareScanStatus } from '../database/entities';
import { PermissionNames, SystemRoleNames } from '../database/permissions';
import { AssistantService } from '../assistant/assistant.service';
import { DocumentsService } from '../documents/documents.service';
import { MalwareScannerUnavailableError } from '../documents/malware-scanner.service';
import { DossiersService } from '../dossiers/dossiers.service';
import { PermissionGuard } from './permission.guard';

const ORG_A = 'organization-a';
const ORG_B = 'organization-b';
const USER_A = 'user-of-a';

function membership(permissions: string[], roleName = 'COLLABORATEUR') {
  return {
    id: 'membership-a',
    organizationId: ORG_A,
    userId: USER_A,
    role: {
      normalizedName: roleName,
      rolePermissions: permissions.map((permissionName) => ({
        permissionName,
      })),
    },
  };
}

describe('Organization isolation at the API boundary', () => {
  function request(organizationId: string): ExecutionContext {
    return {
      getHandler: () => request,
      getClass: () => PermissionGuard,
      switchToHttp: () => ({
        getRequest: () => ({
          params: { organizationId },
          user: { userId: USER_A },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('refuses a user who targets another organization in the URL', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('documents.view'),
    } as unknown as Reflector;
    // USER_A has no membership in ORG_B.
    const findOne = jest.fn().mockResolvedValue(null);
    const guard = new PermissionGuard(reflector, { findOne } as never);

    await expect(guard.canActivate(request(ORG_B))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // The membership is looked up with the organization of the URL and the
    // user of the verified token, never with a value chosen in the body.
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG_B,
          userId: USER_A,
          isActive: true,
          organization: { isActive: true },
        },
      }),
    );
  });
});

describe('Dossier isolation', () => {
  function dossiersService(
    member: ReturnType<typeof membership> | null,
    found: unknown,
  ) {
    const memberships = { findOne: jest.fn().mockResolvedValue(member) };
    const builder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(found),
    };
    const dossiers = {
      findOneBy: jest.fn().mockResolvedValue(found),
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    };
    const service = new DossiersService(
      dossiers as never,
      {} as never,
      {} as never,
      memberships as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, dossiers, builder };
  }

  it('refuses a dossier of an organization the user does not belong to', async () => {
    const t = dossiersService(null, { id: 'dossier-b' });
    await expect(
      t.service.getAccessibleEntity(ORG_B, 'dossier-b', USER_A),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.dossiers.findOneBy).not.toHaveBeenCalled();
  });

  it('hides a dossier of the same cabinet that is not assigned to the collaborator', async () => {
    const t = dossiersService(membership(['documents.view']), null);
    await expect(
      t.service.getAccessibleEntity(ORG_A, 'dossier-not-assigned', USER_A),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.builder.innerJoin).toHaveBeenCalledWith(
      'dossier.assignments',
      'assignment',
      expect.stringContaining('assignment.is_active = true'),
      { membershipId: 'membership-a' },
    );
    expect(t.builder.andWhere).toHaveBeenCalledWith(
      'dossier.organization_id = :organizationId',
      { organizationId: ORG_A },
    );
  });

  it('does not let an owner open a dossier id that belongs to another cabinet', async () => {
    const t = dossiersService(
      membership([PermissionNames.DossiersAssign], 'PROPRIETAIRE'),
      null,
    );
    await expect(
      t.service.getAccessibleEntity(ORG_A, 'dossier-of-b', USER_A),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.dossiers.findOneBy).toHaveBeenCalledWith({
      id: 'dossier-of-b',
      organizationId: ORG_A,
    });
  });
});

describe('Document access and file controls', () => {
  const clientRole = SystemRoleNames.ClientPortal.toUpperCase();

  function documentsService(options: {
    document?: Record<string, unknown> | null;
    roleName?: string;
    scan?: () => Promise<unknown>;
  }) {
    const objectStorage = {
      putObject: jest.fn(),
      signedReadUrl: jest.fn().mockResolvedValue('https://signed'),
    };
    const documents = {
      findOneBy: jest.fn().mockResolvedValue(options.document ?? null),
      save: jest.fn(),
    };
    const audits = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) => Promise.resolve(value)),
    };
    const memberships = {
      findOne: jest
        .fn()
        .mockResolvedValue(membership([], options.roleName ?? 'COLLABORATEUR')),
    };
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({ id: 'dossier-a' }),
    };
    const malwareScanner = {
      scan: jest.fn(
        options.scan ?? (() => Promise.resolve({ status: 'CLEAN' })),
      ),
    };
    const service = new DocumentsService(
      objectStorage as never,
      documents as never,
      {} as never,
      audits as never,
      memberships as never,
      {} as never,
      dossiers as never,
      malwareScanner as never,
      {} as never,
      {} as never,
    );
    return { service, objectStorage, documents, audits, malwareScanner };
  }

  const pdf = {
    buffer: Buffer.from('%PDF-1.7 test'),
    originalname: 'facture.pdf',
    mimetype: 'application/pdf',
    size: 13,
  } as Express.Multer.File;

  it('looks a document up inside the requested organization and dossier only', async () => {
    const t = documentsService({ document: null });
    await expect(
      t.service.downloadUrl(ORG_A, 'dossier-a', 'document-of-b', USER_A),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.documents.findOneBy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'document-of-b',
        organizationId: ORG_A,
        dossierId: 'dossier-a',
      }),
    );
    expect(t.objectStorage.signedReadUrl).not.toHaveBeenCalled();
  });

  it('hides from a portal client a cabinet document not shared with clients', async () => {
    const t = documentsService({
      roleName: clientRole,
      document: {
        id: 'internal',
        objectKey: 'key',
        isClientVisible: false,
        uploadedByUserId: 'accountant',
        malwareScanStatus: MalwareScanStatus.Clean,
      },
    });
    await expect(
      t.service.downloadUrl(ORG_A, 'dossier-a', 'internal', USER_A),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.objectStorage.signedReadUrl).not.toHaveBeenCalled();
  });

  it('never issues a download link for a file marked as infected', async () => {
    const t = documentsService({
      document: {
        id: 'infected',
        objectKey: 'key',
        isClientVisible: true,
        malwareScanStatus: MalwareScanStatus.Infected,
      },
    });
    await expect(
      t.service.downloadUrl(ORG_A, 'dossier-a', 'infected', USER_A),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.objectStorage.signedReadUrl).not.toHaveBeenCalled();
  });

  it('rejects an infected upload before storage and audits the attempt', async () => {
    const t = documentsService({
      scan: () =>
        Promise.resolve({
          status: 'INFECTED',
          signature: 'Eicar-Test-Signature',
        }),
    });
    await expect(
      t.service.upload(ORG_A, 'dossier-a', USER_A, {} as never, pdf),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(t.objectStorage.putObject).not.toHaveBeenCalled();
    expect(t.audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.security_scan.infected',
        detailsJson: expect.objectContaining({ stored: false }) as unknown,
      }),
    );
  });

  it('stores nothing when the antivirus is unavailable', async () => {
    const t = documentsService({
      scan: () => Promise.reject(new MalwareScannerUnavailableError('down')),
    });
    await expect(
      t.service.upload(ORG_A, 'dossier-a', USER_A, {} as never, pdf),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(t.objectStorage.putObject).not.toHaveBeenCalled();
  });

  it('refuses unsupported types, disguised extensions and forged content', () => {
    const t = documentsService({});
    const check = (file: Partial<Express.Multer.File>) => () =>
      t.service.validateIncomingFile({
        ...pdf,
        ...file,
      });
    expect(
      check({ mimetype: 'application/x-msdownload', originalname: 'a.exe' }),
    ).toThrow(BadRequestException);
    expect(check({ originalname: 'facture.pdf.exe' })).toThrow(
      BadRequestException,
    );
    expect(check({ buffer: Buffer.from('MZ executable') })).toThrow(
      BadRequestException,
    );
    expect(check({})).not.toThrow();
  });
});

describe('Assistant retrieval scope', () => {
  function assistant(getAccessibleEntity: jest.Mock) {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
    const embed = jest.fn().mockResolvedValue([0, 1]);
    const service = new AssistantService(
      {
        get: jest.fn((name: string) =>
          name === 'AI_ASSISTANT_ENABLED'
            ? 'true'
            : name === 'VERTEX_AI_EMBEDDING_DIMENSIONS'
              ? '2'
              : undefined,
        ),
      } as never,
      { query } as never,
      { getAccessibleEntity } as never,
      {
        embed,
        answer: jest.fn().mockResolvedValue({
          text: 'Réponse [S1]',
          model: 'gemini',
          usage: null,
        }),
        routeLiveFinancialQuestion: jest.fn(),
      } as never,
      {} as never,
      { answer: jest.fn() } as never,
    );
    return { service, query, embed };
  }

  it('reads nothing and calls no model for a dossier the user cannot access', async () => {
    const t = assistant(
      jest.fn().mockRejectedValue(new NotFoundException('introuvable')),
    );
    await expect(
      t.service.ask(
        ORG_A,
        'dossier-of-b',
        USER_A,
        'Total de la facture FV-1 ?',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.query).not.toHaveBeenCalled();
    expect(t.embed).not.toHaveBeenCalled();
  });

  it('retrieves only approved, non-deleted passages of the requested dossier', async () => {
    const t = assistant(jest.fn().mockResolvedValue({ id: 'dossier-a' }));
    t.query.mockResolvedValue([]);
    await t.service
      .ask(
        ORG_A,
        'dossier-a',
        USER_A,
        'Quel est le total TTC du document FV-2026-013 ?',
      )
      .catch(() => undefined);
    const retrieval = t.query.mock.calls.find(([sql]) =>
      sql.includes('accounting.ai_knowledge_chunks chunk'),
    );
    expect(retrieval).toBeDefined();
    const [sql, params] = retrieval!;
    expect(sql).toContain(
      'WHERE chunk.organization_id = $1 AND chunk.dossier_id = $2',
    );
    expect(sql).toContain('document.organization_id = chunk.organization_id');
    expect(sql).toContain(
      "document.deleted_at_utc IS NULL AND job.status = 'VALIDEE'",
    );
    expect(params.slice(0, 2)).toEqual([ORG_A, 'dossier-a']);
  });
});
