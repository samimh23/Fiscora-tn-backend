import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import type { DocumentObjectStorage } from '../documents/object-storage/object-storage';
import { DossierDeletionService } from './dossier-deletion.service';
import { DeleteDossierDto } from './dto';
import { validate } from 'class-validator';
import {
  ownerPermissions,
  collaboratorPermissions,
  clientPortalPermissions,
  PermissionNames,
} from '../database/permissions';

describe('DossierDeletionService', () => {
  const org = 'organization';
  const dossier = 'dossier';
  const dto = {
    confirmationName: 'Test SARL',
    acknowledgePermanentDeletion: true,
  };
  function setup(
    options: {
      owner?: boolean;
      exists?: boolean;
      path?: string;
      cross?: boolean;
      blocked?: boolean;
    } = {},
  ) {
    const query = jest.fn(async (sql: string) => {
      await Promise.resolve();
      if (sql.includes('SELECT m.id'))
        return options.owner === false ? [] : [{ id: 'membership' }];
      if (sql.includes('SELECT legal_name'))
        return options.exists === false ? [] : [{ legal_name: 'Test SARL' }];
      if (sql.includes('information_schema.columns'))
        return [
          {
            table_name: 'accounting_documents',
            has_organization: true,
            has_id: true,
          },
        ];
      if (sql.includes('FROM pg_constraint'))
        return options.cross
          ? [
              {
                parent: 'accounting_documents',
                child: 'accounting_documents',
                parent_column: 'id',
                child_column: 'replaces_document_id',
              },
            ]
          : [];
      if (sql.includes('SELECT EXISTS'))
        return [{ found: Boolean(options.cross) }];
      if (sql.includes('SELECT id,object_key'))
        return [
          {
            id: 'doc',
            object_key: options.path ?? `${org}/${dossier}/original.png`,
          },
        ];
      if (sql.includes('SELECT id::text')) return [{ id: 'doc' }];
      if (
        options.blocked &&
        sql.includes('DELETE FROM accounting."accounting_documents"')
      )
        throw Object.assign(new Error('FK'), { code: '23503' });
      return [];
    });
    const runner = {
      query,
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const storage = { removeObject: jest.fn() };
    const db = { createQueryRunner: () => runner };
    const service = new DossierDeletionService(
      db as unknown as DataSource,
      storage as unknown as DocumentObjectStorage,
    );
    return { service, runner, storage, db };
  }
  it('reserves the permission for cabinet owners', () => {
    expect(ownerPermissions).toContain(PermissionNames.DossiersDelete);
    expect(collaboratorPermissions).not.toContain(
      PermissionNames.DossiersDelete,
    );
    expect(clientPortalPermissions).not.toContain(
      PermissionNames.DossiersDelete,
    );
  });
  it('validates typed name and explicit true acknowledgment', async () => {
    const invalid = Object.assign(new DeleteDossierDto(), {
      confirmationName: '',
      acknowledgePermanentDeletion: 'true',
    });
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'confirmationName',
        'acknowledgePermanentDeletion',
      ]),
    );
  });
  it.each([
    [{ owner: false }, dto, ForbiddenException],
    [{ exists: false }, dto, NotFoundException],
    [{}, { ...dto, confirmationName: 'Wrong' }, BadRequestException],
    [{}, { ...dto, acknowledgePermanentDeletion: false }, BadRequestException],
    [{ path: 'another-cabinet/file.png' }, dto, ConflictException],
    [{ cross: true }, dto, ConflictException],
    [{ blocked: true }, dto, ConflictException],
  ])(
    'rejects unsafe requests and never removes files (%j)',
    async (options, input, ErrorType) => {
      const { service, runner, storage } = setup(options);
      await expect(
        service.remove(org, dossier, 'actor', input),
      ).rejects.toBeInstanceOf(ErrorType);
      expect(runner.commitTransaction).not.toHaveBeenCalled();
      expect(storage.removeObject).not.toHaveBeenCalled();
    },
  );
  it('commits scoped deletion, audit and durable file queue, without inline storage deletion', async () => {
    const { service, runner, storage } = setup();
    await expect(service.remove(org, dossier, 'actor', dto)).resolves.toEqual({
      deleted: true,
      dossierId: dossier,
      fileCleanupPending: true,
    });
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO accounting.dossier_file_deletions'),
      [org, dossier, `${org}/${dossier}/original.png`],
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM accounting."accounting_documents"'),
      [dossier, org],
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining("'dossier.deleted'"),
      expect.any(Array),
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(storage.removeObject).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'removes successful jobs or defers failed storage cleanup (failure=%s)',
    async (fails) => {
      const { service, storage, db } = setup();
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'job',
              organization_id: org,
              dossier_id: dossier,
              object_key: `${org}/${dossier}/original.png`,
            },
          ])
          .mockResolvedValue([]),
      };
      Object.assign(db, {
        transaction: (callback: (m: QueryRunner) => unknown) =>
          Promise.resolve(callback(manager as unknown as QueryRunner)),
      });
      if (fails)
        storage.removeObject.mockRejectedValueOnce(
          new Error('storage unavailable'),
        );
      await service.cleanupFiles();
      expect(storage.removeObject).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining(
          fails
            ? 'UPDATE accounting.dossier_file_deletions'
            : 'DELETE FROM accounting.dossier_file_deletions',
        ),
        ['job'],
      );
    },
  );
});
