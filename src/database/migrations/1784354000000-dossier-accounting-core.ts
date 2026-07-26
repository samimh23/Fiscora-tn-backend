import { MigrationInterface, QueryRunner } from 'typeorm';

export class DossierAccountingCore1784354000000 implements MigrationInterface {
  name = 'DossierAccountingCore1784354000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounting.fiscal_years ADD COLUMN dossier_id uuid;
      ALTER TABLE accounting.ledger_accounts ADD COLUMN dossier_id uuid;
      ALTER TABLE accounting.fiscal_years DROP CONSTRAINT IF EXISTS "UQ_43e0620bf006a19202864832263";
      ALTER TABLE accounting.ledger_accounts DROP CONSTRAINT IF EXISTS "UQ_17ccacb2b61064f7c17704c6fb8";

      CREATE TEMP TABLE account_clone_map (
        old_id uuid NOT NULL,
        dossier_id uuid NOT NULL,
        new_id uuid NOT NULL,
        PRIMARY KEY (old_id, dossier_id)
      ) ON COMMIT DROP;

      INSERT INTO account_clone_map(old_id, dossier_id, new_id)
      SELECT a.id, d.id,
        CASE WHEN d.id = first_value(d.id) OVER (PARTITION BY a.id ORDER BY d.created_at_utc, d.id)
          THEN a.id ELSE uuid_generate_v4() END
      FROM accounting.ledger_accounts a
      JOIN accounting.client_dossiers d ON d.organization_id = a.organization_id;

      UPDATE accounting.ledger_accounts a
      SET dossier_id = m.dossier_id
      FROM account_clone_map m
      WHERE m.old_id = a.id AND m.new_id = a.id;

      INSERT INTO accounting.ledger_accounts (
        id, created_at_utc, updated_at_utc, organization_id, dossier_id,
        code, normalized_code, name, description, type, normal_balance,
        parent_account_id, allows_posting, is_active
      )
      SELECT m.new_id, a.created_at_utc, a.updated_at_utc, a.organization_id, m.dossier_id,
        a.code, a.normalized_code, a.name, a.description, a.type, a.normal_balance,
        NULL, a.allows_posting, a.is_active
      FROM account_clone_map m
      JOIN accounting.ledger_accounts a ON a.id = m.old_id
      WHERE m.new_id <> m.old_id;

      UPDATE accounting.ledger_accounts clone
      SET parent_account_id = parent_map.new_id
      FROM account_clone_map self_map
      JOIN accounting.ledger_accounts original ON original.id = self_map.old_id
      JOIN account_clone_map parent_map
        ON parent_map.old_id = original.parent_account_id
       AND parent_map.dossier_id = self_map.dossier_id
      WHERE clone.id = self_map.new_id;

      UPDATE accounting.journal_entry_lines target
      SET account_id = m.new_id
      FROM accounting.journal_entries owner
      JOIN account_clone_map m ON m.dossier_id = owner.dossier_id
      WHERE target.entry_id = owner.id AND m.old_id = target.account_id;

      UPDATE accounting.third_parties target SET receivable_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.receivable_account_id;
      UPDATE accounting.third_parties target SET payable_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.payable_account_id;

      UPDATE accounting.business_invoices target SET third_party_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.third_party_account_id;
      UPDATE accounting.business_invoices target SET vat_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.vat_account_id;
      UPDATE accounting.business_invoices target SET stamp_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.stamp_account_id;
      UPDATE accounting.business_invoices target SET withholding_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.withholding_account_id;
      UPDATE accounting.business_invoice_lines target SET account_id = m.new_id
      FROM accounting.business_invoices owner
      JOIN account_clone_map m ON m.dossier_id = owner.dossier_id
      WHERE target.invoice_id = owner.id AND m.old_id = target.account_id;

      UPDATE accounting.third_party_payments target SET cash_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.cash_account_id;
      UPDATE accounting.third_party_payments target SET third_party_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.third_party_account_id;
      UPDATE accounting.bank_accounts target SET ledger_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.ledger_account_id;

      UPDATE accounting.fixed_asset_categories target SET asset_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.asset_account_id;
      UPDATE accounting.fixed_asset_categories target SET accumulated_depreciation_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.accumulated_depreciation_account_id;
      UPDATE accounting.fixed_asset_categories target SET depreciation_expense_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.depreciation_expense_account_id;
      UPDATE accounting.fixed_assets target SET asset_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.asset_account_id;
      UPDATE accounting.fixed_assets target SET accumulated_depreciation_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.accumulated_depreciation_account_id;
      UPDATE accounting.fixed_assets target SET depreciation_expense_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.depreciation_expense_account_id;

      UPDATE accounting.accounting_year_closings target SET result_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.result_account_id;
      UPDATE accounting.financial_statement_mappings target SET account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.account_id;
      UPDATE accounting.foreign_trade_operations target SET trade_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.trade_account_id;
      UPDATE accounting.foreign_trade_operations target SET third_party_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.third_party_account_id;
      UPDATE accounting.foreign_trade_operations target SET vat_account_id = m.new_id
      FROM account_clone_map m WHERE m.dossier_id = target.dossier_id AND m.old_id = target.vat_account_id;

      DELETE FROM accounting.ledger_accounts WHERE dossier_id IS NULL;

      CREATE TEMP TABLE fiscal_year_clone_map (
        old_id uuid NOT NULL,
        dossier_id uuid NOT NULL,
        new_id uuid NOT NULL,
        PRIMARY KEY (old_id, dossier_id)
      ) ON COMMIT DROP;

      INSERT INTO fiscal_year_clone_map(old_id, dossier_id, new_id)
      SELECT y.id, d.id,
        CASE WHEN d.id = first_value(d.id) OVER (PARTITION BY y.id ORDER BY d.created_at_utc, d.id)
          THEN y.id ELSE uuid_generate_v4() END
      FROM accounting.fiscal_years y
      JOIN accounting.client_dossiers d ON d.organization_id = y.organization_id;

      UPDATE accounting.fiscal_years y SET dossier_id = m.dossier_id
      FROM fiscal_year_clone_map m WHERE m.old_id = y.id AND m.new_id = y.id;

      INSERT INTO accounting.fiscal_years (
        id, created_at_utc, updated_at_utc, organization_id, dossier_id,
        name, starts_on, ends_on, status, closed_at_utc, closed_by_user_id
      )
      SELECT m.new_id, y.created_at_utc, y.updated_at_utc, y.organization_id, m.dossier_id,
        y.name, y.starts_on, y.ends_on, y.status, y.closed_at_utc, y.closed_by_user_id
      FROM fiscal_year_clone_map m
      JOIN accounting.fiscal_years y ON y.id = m.old_id
      WHERE m.new_id <> m.old_id;

      DELETE FROM accounting.fiscal_years WHERE dossier_id IS NULL;

      ALTER TABLE accounting.fiscal_years ALTER COLUMN dossier_id SET NOT NULL;
      ALTER TABLE accounting.ledger_accounts ALTER COLUMN dossier_id SET NOT NULL;

      ALTER TABLE accounting.fiscal_years DROP CONSTRAINT IF EXISTS "UQ_43e0620bf006a19202864832263";
      ALTER TABLE accounting.ledger_accounts DROP CONSTRAINT IF EXISTS "UQ_17ccacb2b61064f7c17704c6fb8";
      ALTER TABLE accounting.fiscal_years ADD CONSTRAINT uq_fiscal_year_dossier_name UNIQUE (dossier_id, name);
      ALTER TABLE accounting.ledger_accounts ADD CONSTRAINT uq_ledger_account_dossier_code UNIQUE (dossier_id, normalized_code);
      ALTER TABLE accounting.fiscal_years ADD CONSTRAINT fk_fiscal_year_dossier FOREIGN KEY (dossier_id) REFERENCES accounting.client_dossiers(id) ON DELETE CASCADE;
      ALTER TABLE accounting.ledger_accounts ADD CONSTRAINT fk_ledger_account_dossier FOREIGN KEY (dossier_id) REFERENCES accounting.client_dossiers(id) ON DELETE CASCADE;
      CREATE INDEX idx_fiscal_year_dossier_dates ON accounting.fiscal_years(organization_id, dossier_id, starts_on, ends_on);
      CREATE INDEX idx_ledger_account_dossier_active ON accounting.ledger_accounts(organization_id, dossier_id, is_active);

      ALTER TABLE accounting.journal_entries
        ADD COLUMN submitted_by_user_id uuid,
        ADD COLUMN submitted_at_utc timestamptz,
        ADD COLUMN reviewed_by_user_id uuid,
        ADD COLUMN reviewed_at_utc timestamptz,
        ADD COLUMN review_comment text;

      CREATE TABLE accounting.account_reconciliations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at_utc timestamptz NOT NULL DEFAULT now(),
        updated_at_utc timestamptz DEFAULT now(),
        organization_id uuid NOT NULL,
        dossier_id uuid NOT NULL,
        account_id uuid NOT NULL,
        code varchar(30) NOT NULL,
        reconciliation_date date NOT NULL,
        total_debit numeric(15,3) NOT NULL,
        total_credit numeric(15,3) NOT NULL,
        created_by_user_id uuid NOT NULL,
        CONSTRAINT uq_reconciliation_dossier_code UNIQUE(dossier_id, code),
        CONSTRAINT fk_reconciliation_dossier FOREIGN KEY(dossier_id) REFERENCES accounting.client_dossiers(id) ON DELETE CASCADE,
        CONSTRAINT fk_reconciliation_account FOREIGN KEY(account_id) REFERENCES accounting.ledger_accounts(id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_reconciliation_lookup ON accounting.account_reconciliations(organization_id, dossier_id, account_id, reconciliation_date);
      ALTER TABLE accounting.journal_entry_lines
        ADD COLUMN reconciliation_id uuid,
        ADD COLUMN letter_code varchar(30),
        ADD COLUMN reconciled_at_utc timestamptz,
        ADD CONSTRAINT fk_line_reconciliation FOREIGN KEY(reconciliation_id) REFERENCES accounting.account_reconciliations(id) ON DELETE SET NULL;
      CREATE INDEX idx_line_reconciliation ON accounting.journal_entry_lines(reconciliation_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounting.journal_entry_lines DROP CONSTRAINT IF EXISTS fk_line_reconciliation;
      DROP INDEX IF EXISTS accounting.idx_line_reconciliation;
      ALTER TABLE accounting.journal_entry_lines DROP COLUMN IF EXISTS reconciled_at_utc, DROP COLUMN IF EXISTS letter_code, DROP COLUMN IF EXISTS reconciliation_id;
      DROP TABLE IF EXISTS accounting.account_reconciliations;
      ALTER TABLE accounting.journal_entries DROP COLUMN IF EXISTS review_comment, DROP COLUMN IF EXISTS reviewed_at_utc, DROP COLUMN IF EXISTS reviewed_by_user_id, DROP COLUMN IF EXISTS submitted_at_utc, DROP COLUMN IF EXISTS submitted_by_user_id;
      DROP INDEX IF EXISTS accounting.idx_ledger_account_dossier_active;
      DROP INDEX IF EXISTS accounting.idx_fiscal_year_dossier_dates;
      ALTER TABLE accounting.ledger_accounts DROP CONSTRAINT IF EXISTS fk_ledger_account_dossier, DROP CONSTRAINT IF EXISTS uq_ledger_account_dossier_code;
      ALTER TABLE accounting.fiscal_years DROP CONSTRAINT IF EXISTS fk_fiscal_year_dossier, DROP CONSTRAINT IF EXISTS uq_fiscal_year_dossier_name;
      ALTER TABLE accounting.ledger_accounts DROP COLUMN IF EXISTS dossier_id;
      ALTER TABLE accounting.fiscal_years DROP COLUMN IF EXISTS dossier_id;
      ALTER TABLE accounting.ledger_accounts ADD CONSTRAINT "UQ_17ccacb2b61064f7c17704c6fb8" UNIQUE(organization_id, normalized_code);
      ALTER TABLE accounting.fiscal_years ADD CONSTRAINT "UQ_43e0620bf006a19202864832263" UNIQUE(organization_id, name);
    `);
  }
}
