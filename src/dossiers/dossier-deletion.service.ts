import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, QueryRunner } from 'typeorm';
import { DeleteDossierDto } from './dto';
import { DOCUMENT_OBJECT_STORAGE } from '../documents/object-storage/object-storage';
import type { DocumentObjectStorage } from '../documents/object-storage/object-storage';
import { SystemRoleNames } from '../database/permissions';

interface ScopeTable {
  table_name: string;
  has_organization: boolean;
  has_id: boolean;
}
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
async function queryRows<T>(
  runner: Pick<QueryRunner, 'query'>,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  const rows: unknown = await runner.query(sql, parameters);
  return rows as T[];
}

@Injectable()
export class DossierDeletionService {
  private readonly logger = new Logger(DossierDeletionService.name);
  private draining = false;
  constructor(
    private readonly db: DataSource,
    @Inject(DOCUMENT_OBJECT_STORAGE)
    private readonly storage: DocumentObjectStorage,
  ) {}

  async remove(
    organizationId: string,
    dossierId: string,
    actorId: string,
    dto: DeleteDossierDto,
  ) {
    if (dto.acknowledgePermanentDeletion !== true)
      throw new BadRequestException('Confirmez la suppression définitive.');
    const runner = this.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL lock_timeout='10s'`);
      await runner.query(`SET LOCAL statement_timeout='30s'`);
      const owners: { id: string }[] = await queryRows(
        runner,
        `SELECT m.id FROM accounting.organization_memberships m
        JOIN accounting.roles r ON r.id=m.role_id JOIN accounting.organizations o ON o.id=m.organization_id
        WHERE m.organization_id=$1 AND m.user_id=$2 AND m.is_active AND o.is_active AND r.name=$3
        FOR SHARE OF m,r,o`,
        [organizationId, actorId, SystemRoleNames.Owner],
      );
      if (!owners.length)
        throw new ForbiddenException(
          'Seul le propriétaire du cabinet peut supprimer un dossier.',
        );
      const dossiers: { legal_name: string }[] = await queryRows(
        runner,
        `SELECT legal_name FROM accounting.client_dossiers
        WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, dossierId],
      );
      if (!dossiers.length) throw new NotFoundException('Dossier introuvable.');
      if (dto.confirmationName !== dossiers[0].legal_name)
        throw new BadRequestException(
          'Le nom de confirmation doit correspondre exactement au dossier.',
        );

      const tables: ScopeTable[] = await queryRows(
        runner,
        `SELECT c.table_name,
        bool_or(c.column_name='organization_id') AS has_organization, bool_or(c.column_name='id') AS has_id
        FROM information_schema.columns c JOIN information_schema.tables t
          ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
        WHERE c.table_schema='accounting' GROUP BY c.table_name
        HAVING bool_or(c.column_name='dossier_id') AND c.table_name NOT IN
          ('dossier_file_deletions','training_dataset_examples','audit_logs') ORDER BY c.table_name`,
      );
      await this.rejectCrossDossierReferences(runner, dossierId, tables);
      for (const table of tables.filter((row) => row.has_organization)) {
        const rows: { found: boolean }[] = await queryRows(
          runner,
          `SELECT EXISTS(SELECT 1 FROM accounting.${quote(table.table_name)}
          WHERE dossier_id=$1 AND organization_id IS DISTINCT FROM $2) AS found`,
          [dossierId, organizationId],
        );
        if (rows[0].found)
          throw new ConflictException(
            'Des données appartiennent à un autre cabinet. Suppression annulée.',
          );
      }
      const documents: { id: string; object_key: string }[] = await queryRows(
        runner,
        `SELECT id,object_key FROM accounting.accounting_documents
        WHERE organization_id=$1 AND dossier_id=$2`,
        [organizationId, dossierId],
      );
      const objectKeys = [...new Set(documents.map((row) => row.object_key))];
      // Never accept an arbitrary storage path from a browser or a corrupted record.
      if (
        objectKeys.some(
          (key) => !key.startsWith(`${organizationId}/${dossierId}/`),
        )
      )
        throw new ConflictException(
          'Une pièce possède un chemin de stockage incohérent. Suppression annulée.',
        );
      const linkedIds = [dossierId];
      for (const table of tables.filter((row) => row.has_id)) {
        const ids: { id: string }[] = await queryRows(
          runner,
          `SELECT id::text AS id FROM accounting.${quote(table.table_name)}
          WHERE dossier_id=$1${table.has_organization ? ' AND organization_id=$2' : ''}`,
          table.has_organization ? [dossierId, organizationId] : [dossierId],
        );
        linkedIds.push(...ids.map((row) => row.id));
      }
      await runner.query(
        `DELETE FROM accounting.notifications WHERE organization_id=$1 AND entity_id=ANY($2::uuid[])`,
        [organizationId, linkedIds],
      );
      let pending = tables;
      while (pending.length) {
        const blocked: ScopeTable[] = [];
        for (const table of pending) {
          await runner.query('SAVEPOINT dossier_delete');
          try {
            await runner.query(
              `DELETE FROM accounting.${quote(table.table_name)} WHERE dossier_id=$1
              ${table.has_organization ? 'AND organization_id=$2' : ''}`,
              table.has_organization
                ? [dossierId, organizationId]
                : [dossierId],
            );
            await runner.query('RELEASE SAVEPOINT dossier_delete');
          } catch (error) {
            await runner.query('ROLLBACK TO SAVEPOINT dossier_delete');
            await runner.query('RELEASE SAVEPOINT dossier_delete');
            if ((error as { code?: string }).code !== '23503') throw error;
            blocked.push(table);
          }
        }
        if (blocked.length === pending.length)
          throw new ConflictException(
            'Des liens comptables empêchent la suppression. Aucune donnée n’a été supprimée.',
          );
        pending = blocked;
      }
      await runner.query(
        'DELETE FROM accounting.client_dossiers WHERE organization_id=$1 AND id=$2',
        [organizationId, dossierId],
      );
      // Training consent is gone: existing training cleanup retires examples and
      // exports; downloading revoked exports already checks live consent.
      for (const key of objectKeys)
        await runner.query(
          `INSERT INTO accounting.dossier_file_deletions
        (organization_id,dossier_id,object_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [organizationId, dossierId, key],
        );
      await runner.query(
        `INSERT INTO accounting.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details_json)
        VALUES($1,$2,'dossier.deleted','ClientDossier',$3,$4)`,
        [
          organizationId,
          actorId,
          dossierId,
          JSON.stringify({
            legalName: dossiers[0].legal_name,
            documentCount: documents.length,
          }),
        ],
      );
      await runner.commitTransaction();
      return {
        deleted: true,
        dossierId,
        fileCleanupPending: objectKeys.length > 0,
      };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  private async rejectCrossDossierReferences(
    runner: QueryRunner,
    dossierId: string,
    tables: ScopeTable[],
  ) {
    const names = new Set(tables.map((row) => row.table_name));
    const links: {
      parent: string;
      child: string;
      parent_column: string;
      child_column: string;
    }[] = await queryRows(
      runner,
      `SELECT
      p.relname AS parent,c.relname AS child,pa.attname AS parent_column,ca.attname AS child_column
      FROM pg_constraint fk JOIN pg_class p ON p.oid=fk.confrelid JOIN pg_class c ON c.oid=fk.conrelid
      JOIN pg_namespace pn ON pn.oid=p.relnamespace JOIN pg_namespace cn ON cn.oid=c.relnamespace
      JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=fk.confkey[1]
      JOIN pg_attribute ca ON ca.attrelid=c.oid AND ca.attnum=fk.conkey[1]
      WHERE fk.contype='f' AND pn.nspname='accounting' AND cn.nspname='accounting'
        AND array_length(fk.conkey,1)=1 AND array_length(fk.confkey,1)=1`,
    );
    for (const link of links)
      if (names.has(link.parent) && names.has(link.child)) {
        const rows: { found: boolean }[] = await queryRows(
          runner,
          `SELECT EXISTS(SELECT 1 FROM accounting.${quote(link.child)} c
        JOIN accounting.${quote(link.parent)} p ON c.${quote(link.child_column)}=p.${quote(link.parent_column)}
        WHERE p.dossier_id=$1 AND c.dossier_id IS DISTINCT FROM $1) AS found`,
          [dossierId],
        );
        if (rows[0].found)
          throw new ConflictException(
            'Ce dossier est lié aux données d’un autre dossier. Suppression annulée.',
          );
      }
  }

  @Cron('*/30 * * * * *')
  async cleanupFiles() {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let i = 0; i < 20; i++) {
        const processed = await this.db.transaction(async (manager) => {
          const rows: {
            id: string;
            organization_id: string;
            dossier_id: string;
            object_key: string;
          }[] = await queryRows(
            manager,
            `SELECT * FROM accounting.dossier_file_deletions
            WHERE available_at_utc<=now() ORDER BY available_at_utc LIMIT 1 FOR UPDATE SKIP LOCKED`,
          );
          if (!rows.length) return false;
          const row = rows[0];
          try {
            if (
              !row.object_key.startsWith(
                `${row.organization_id}/${row.dossier_id}/`,
              )
            )
              throw new Error('Invalid storage scope');
            await this.storage.removeObject(row.object_key);
            await manager.query(
              'DELETE FROM accounting.dossier_file_deletions WHERE id=$1',
              [row.id],
            );
          } catch {
            await manager.query(
              `UPDATE accounting.dossier_file_deletions SET attempts=attempts+1,
              available_at_utc=now()+interval '5 minutes' WHERE id=$1`,
              [row.id],
            );
            this.logger.warn(`Dossier file cleanup deferred: ${row.id}`);
          }
          return true;
        });
        if (!processed) break;
      }
    } catch {
      this.logger.warn(
        'Dossier file cleanup unavailable; persisted jobs will retry.',
      );
    } finally {
      this.draining = false;
    }
  }
}
