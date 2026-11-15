import 'dotenv/config';
import dataSource from '../database/data-source';
import {
  categoryFor,
  EVAL_BANK_STATEMENTS,
  EVAL_INVOICES,
  EVAL_OBJECT_KEY_PREFIX,
  EVAL_YEAR,
  normalizedDataFor,
} from './rag-eval/fixture';

/**
 * Loads the fictional evaluation dossier as approved extractions.
 *
 *   FISCORA_ORGANIZATION_ID=... FISCORA_DOSSIER_ID=... npm run assistant:eval:seed
 *   npm run assistant:eval:seed -- --clean     (removes what this script added)
 *
 * Use an empty dossier created only for the evaluation: the script refuses a
 * dossier that already holds other documents, so real client data is never
 * mixed with test data. Inserting approved extractions queues the normal
 * indexing jobs; the API's indexing worker then embeds them.
 */
async function main() {
  const organizationId = required('FISCORA_ORGANIZATION_ID');
  const dossierId = required('FISCORA_DOSSIER_ID');
  const clean = process.argv.includes('--clean');
  const keyPrefix = `${EVAL_OBJECT_KEY_PREFIX}${dossierId}/`;
  await dataSource.initialize();
  try {
    const dossier = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM accounting.client_dossiers
       WHERE id = $1 AND organization_id = $2`,
      [dossierId, organizationId],
    );
    if (!dossier.length) {
      throw new Error('Dossier introuvable pour cette organisation.');
    }

    if (clean) {
      await dataSource.transaction(async (manager) => {
        const removed = await manager.query<Array<{ id: string }>>(
          `DELETE FROM accounting.accounting_documents
           WHERE organization_id = $1 AND dossier_id = $2
             AND object_key LIKE $3
           RETURNING id`,
          [organizationId, dossierId, `${keyPrefix}%`],
        );
        const ids = removed.map((row) => row.id);
        await manager.query(
          `DELETE FROM accounting.ai_knowledge_chunks
           WHERE organization_id = $1 AND dossier_id = $2
             AND source_type = 'REVIEWED_EXTRACTION'
             AND source_id = ANY($3::text[])`,
          [organizationId, dossierId, ids],
        );
        await manager.query(
          `DELETE FROM accounting.ai_indexing_jobs
           WHERE organization_id = $1 AND dossier_id = $2
             AND document_id = ANY($3::uuid[])`,
          [organizationId, dossierId, ids],
        );
        console.log(`${ids.length} document(s) d’évaluation supprimé(s).`);
      });
      return;
    }

    const foreign = await dataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM accounting.accounting_documents
       WHERE organization_id = $1 AND dossier_id = $2
         AND object_key NOT LIKE $3`,
      [organizationId, dossierId, `${keyPrefix}%`],
    );
    if (Number(foreign[0].count) > 0) {
      throw new Error(
        `Ce dossier contient déjà ${foreign[0].count} autre(s) document(s). Créez un dossier vide réservé à l’évaluation.`,
      );
    }

    const documents = [...EVAL_INVOICES, ...EVAL_BANK_STATEMENTS];
    await dataSource.transaction(async (manager) => {
      for (const document of documents) {
        const [row] = await manager.query<Array<{ id: string }>>(
          `INSERT INTO accounting.accounting_documents (
             organization_id, dossier_id, original_name, object_key,
             mime_type, size_bytes, category, period_year, period_month
           ) VALUES ($1, $2, $3, $4, 'application/pdf', 0, $5, $6, $7)
           ON CONFLICT (object_key) DO UPDATE SET
             original_name = EXCLUDED.original_name,
             category = EXCLUDED.category,
             period_year = EXCLUDED.period_year,
             period_month = EXCLUDED.period_month,
             deleted_at_utc = NULL
           RETURNING id`,
          [
            organizationId,
            dossierId,
            document.fileName,
            `${keyPrefix}${document.fileName}`,
            categoryFor(document),
            EVAL_YEAR,
            document.month,
          ],
        );
        await manager.query(
          `INSERT INTO accounting.document_extraction_jobs (
             organization_id, dossier_id, document_id, status, model_name,
             normalized_data, processed_at_utc, reviewed_at_utc, review_comment
           ) VALUES ($1, $2, $3, 'VALIDEE', 'rag-eval-fixture', $4::jsonb,
             now(), now(), 'Donnée synthétique d’évaluation')
           ON CONFLICT (document_id) DO UPDATE SET
             status = 'VALIDEE',
             normalized_data = EXCLUDED.normalized_data,
             reviewed_at_utc = now(),
             updated_at_utc = now()`,
          [
            organizationId,
            dossierId,
            row.id,
            JSON.stringify(normalizedDataFor(document)),
          ],
        );
      }
    });
    console.log(
      `${documents.length} document(s) validé(s) chargé(s). L’indexation se fait en arrière-plan ; vous pouvez aussi lancer la réindexation du dossier depuis l’assistant.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
