import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkflowIntegrity1790784000000 implements MigrationInterface {
  name = 'WorkflowIntegrity1790784000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounting.business_invoices
        ADD COLUMN fodec_account_id uuid REFERENCES accounting.ledger_accounts(id) ON DELETE RESTRICT,
        ADD COLUMN fodec_amount numeric(15,3) NOT NULL DEFAULT 0;
      ALTER TABLE accounting.business_invoice_lines
        ADD COLUMN fodec_rate numeric(8,5),
        ADD COLUMN fodec_amount numeric(15,3) NOT NULL DEFAULT 0;
      ALTER TABLE accounting.business_invoices DROP CONSTRAINT "CHK_invoice_settlement_status";
      ALTER TABLE accounting.business_invoices ADD CONSTRAINT "CHK_invoice_settlement_status"
        CHECK (settlement_status IN ('NON_REGLEE','PARTIELLEMENT_REGLEE','REGLEE','A_REMBOURSER'));
      UPDATE accounting.journal_entries entry
      SET status = 'REJETEE', reviewed_by_user_id = payment.corrected_by_user_id,
          reviewed_at_utc = COALESCE(payment.corrected_at_utc, now()),
          review_comment = 'Brouillon retiré : règlement déjà annulé'
      FROM accounting.third_party_payments payment
      WHERE payment.journal_entry_id = entry.id
        AND payment.organization_id = entry.organization_id AND payment.dossier_id = entry.dossier_id
        AND payment.status = 'ANNULE' AND entry.status = 'BROUILLON';
    `);
  }
  down(): Promise<void> {
    // Refuse a destructive rollback that would erase tax identity or refund balances.
    return Promise.reject(
      new Error(
        'Cette migration contient des données financières. Une migration corrective explicite est requise.',
      ),
    );
  }
}
