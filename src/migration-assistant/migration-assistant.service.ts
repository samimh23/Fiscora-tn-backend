import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AccountingJournal,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalType,
  LedgerAccount,
  LedgerAccountType,
  NormalBalance,
  ThirdParty,
  ThirdPartyType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { MigrationImportKind, MigrationImportOptionsDto } from './dto';
import { MigrationRow, parseMigrationFile, pick } from './migration-file.parser';

export interface ImportResult {
  kind: MigrationImportKind;
  rows: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
  sample: Array<Record<string, string>>;
}

@Injectable()
export class MigrationAssistantService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    @InjectRepository(ThirdParty)
    private readonly thirdParties: Repository<ThirdParty>,
    private readonly dossiers: DossiersService,
  ) {}

  async preview(
    organizationId: string,
    dossierId: string,
    userId: string,
    kind: MigrationImportKind,
    file?: Express.Multer.File,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const rows = await parseMigrationFile(file);
    const warnings = this.validateRows(kind, rows);
    return {
      kind,
      rows: rows.length,
      validRows: rows.length - warnings.length,
      warnings: warnings.slice(0, 30),
      sample: rows.slice(0, 10).map((row) => row.values),
    };
  }

  async import(
    organizationId: string,
    dossierId: string,
    userId: string,
    kind: MigrationImportKind,
    options: MigrationImportOptionsDto,
    file?: Express.Multer.File,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const rows = await parseMigrationFile(file);
    if (kind === MigrationImportKind.Accounts)
      return this.importAccounts(organizationId, dossierId, rows);
    if (kind === MigrationImportKind.Journals)
      return this.importJournals(organizationId, dossierId, rows);
    if (kind === MigrationImportKind.ThirdParties)
      return this.importThirdParties(organizationId, dossierId, rows);
    return this.importOpeningBalances(
      organizationId,
      dossierId,
      userId,
      rows,
      options.openingDate || new Date().toISOString().slice(0, 10),
    );
  }

  private validateRows(kind: MigrationImportKind, rows: MigrationRow[]) {
    return rows
      .map((row) => {
        if (kind === MigrationImportKind.Accounts) {
          if (!pick(row, ['code', 'compte', 'numero', 'numéro']))
            return `ligne ${row.rowNumber}: code compte manquant`;
          if (!pick(row, ['name', 'nom', 'libelle', 'libellé', 'intitule', 'intitulé']))
            return `ligne ${row.rowNumber}: libellé compte manquant`;
        }
        if (kind === MigrationImportKind.Journals) {
          if (!pick(row, ['code', 'journal', 'codejournal']))
            return `ligne ${row.rowNumber}: code journal manquant`;
        }
        if (kind === MigrationImportKind.ThirdParties) {
          if (!pick(row, ['name', 'nom', 'raison sociale', 'raisonsociale']))
            return `ligne ${row.rowNumber}: nom du tiers manquant`;
        }
        if (kind === MigrationImportKind.OpeningBalances) {
          if (!pick(row, ['code', 'compte', 'accountcode']))
            return `ligne ${row.rowNumber}: code compte manquant`;
          if (!pick(row, ['debit', 'débit', 'credit', 'crédit', 'solde']))
            return `ligne ${row.rowNumber}: montant manquant`;
        }
        return null;
      })
      .filter((warning): warning is string => Boolean(warning));
  }

  private async importAccounts(
    organizationId: string,
    dossierId: string,
    rows: MigrationRow[],
  ): Promise<ImportResult> {
    let created = 0;
    let updated = 0;
    const warnings: string[] = [];
    for (const row of rows) {
      const code = pick(row, ['code', 'compte', 'numero', 'numéro']).slice(0, 30);
      const name = pick(row, ['name', 'nom', 'libelle', 'libellé', 'intitule', 'intitulé']).slice(0, 200);
      if (!code || !name) {
        warnings.push(`ligne ${row.rowNumber}: compte ignoré, code ou libellé manquant`);
        continue;
      }
      const normalizedCode = normalizeCode(code);
      const type = accountType(code);
      const normalBalance = normalBalanceFor(type);
      const existing = await this.accounts.findOneBy({
        organizationId,
        dossierId,
        normalizedCode,
      });
      if (existing) {
        existing.name = name;
        existing.type = type;
        existing.normalBalance = normalBalance;
        existing.description = pick(row, ['description', 'note']) || existing.description;
        existing.allowsPosting = true;
        existing.isActive = true;
        await this.accounts.save(existing);
        updated += 1;
      } else {
        await this.accounts.save(
          this.accounts.create({
            organizationId,
            dossierId,
            code,
            normalizedCode,
            name,
            description: pick(row, ['description', 'note']) || null,
            type,
            normalBalance,
            parentAccountId: null,
            allowsPosting: true,
            isActive: true,
          }),
        );
        created += 1;
      }
    }
    return result(MigrationImportKind.Accounts, rows, created, updated, warnings);
  }

  private async importJournals(
    organizationId: string,
    dossierId: string,
    rows: MigrationRow[],
  ): Promise<ImportResult> {
    let created = 0;
    let updated = 0;
    const warnings: string[] = [];
    for (const row of rows) {
      const code = pick(row, ['code', 'journal', 'codejournal']).slice(0, 20).toUpperCase();
      const name = (pick(row, ['name', 'nom', 'libelle', 'libellé']) || code).slice(0, 150);
      if (!code) {
        warnings.push(`ligne ${row.rowNumber}: journal ignoré, code manquant`);
        continue;
      }
      const type = journalType(pick(row, ['type', 'nature']) || code);
      const existing = await this.journals.findOneBy({ organizationId, dossierId, code });
      if (existing) {
        existing.name = name;
        existing.type = type;
        existing.isActive = true;
        await this.journals.save(existing);
        updated += 1;
      } else {
        await this.journals.save(
          this.journals.create({
            organizationId,
            dossierId,
            code,
            name,
            type,
            isActive: true,
          }),
        );
        created += 1;
      }
    }
    return result(MigrationImportKind.Journals, rows, created, updated, warnings);
  }

  private async importThirdParties(
    organizationId: string,
    dossierId: string,
    rows: MigrationRow[],
  ): Promise<ImportResult> {
    let created = 0;
    let updated = 0;
    const warnings: string[] = [];
    for (const row of rows) {
      const name = pick(row, ['name', 'nom', 'raison sociale', 'raisonsociale']).slice(0, 200);
      if (!name) {
        warnings.push(`ligne ${row.rowNumber}: tiers ignoré, nom manquant`);
        continue;
      }
      const type = thirdPartyType(pick(row, ['type', 'nature', 'categorie', 'catégorie']));
      const existing = await this.thirdParties.findOneBy({ organizationId, dossierId, type, name });
      const payload = {
        taxIdentifier: pick(row, ['matricule fiscal', 'matriculefiscal', 'mf', 'taxidentifier']) || null,
        rneNumber: pick(row, ['rne', 'rnenumber']) || null,
        email: pick(row, ['email', 'e-mail', 'mail']) || null,
        phone: pick(row, ['phone', 'telephone', 'téléphone', 'tel']) || null,
        address: pick(row, ['address', 'adresse']) || null,
        isActive: true,
      };
      if (existing) {
        Object.assign(existing, payload);
        await this.thirdParties.save(existing);
        updated += 1;
      } else {
        await this.thirdParties.save(
          this.thirdParties.create({
            organizationId,
            dossierId,
            type,
            name,
            ...payload,
            receivableAccountId: null,
            payableAccountId: null,
          }),
        );
        created += 1;
      }
    }
    return result(MigrationImportKind.ThirdParties, rows, created, updated, warnings);
  }

  private async importOpeningBalances(
    organizationId: string,
    dossierId: string,
    userId: string,
    rows: MigrationRow[],
    openingDate: string,
  ): Promise<ImportResult> {
    const warnings: string[] = [];
    const lines: Array<{ account: LedgerAccount; debit: string; credit: string; label: string }> = [];
    for (const row of rows) {
      const code = pick(row, ['code', 'compte', 'accountcode']);
      const account = await this.accounts.findOneBy({
        organizationId,
        dossierId,
        normalizedCode: normalizeCode(code),
        isActive: true,
        allowsPosting: true,
      });
      if (!account) {
        warnings.push(`ligne ${row.rowNumber}: compte ${code || '?'} introuvable`);
        continue;
      }
      const debit = moneyValue(pick(row, ['debit', 'débit']));
      const credit = moneyValue(pick(row, ['credit', 'crédit']));
      const signed = moneyValue(pick(row, ['solde', 'balance']));
      const finalDebit = debit !== 0n ? debit : signed > 0n ? signed : 0n;
      const finalCredit = credit !== 0n ? credit : signed < 0n ? -signed : 0n;
      if (finalDebit === 0n && finalCredit === 0n) continue;
      lines.push({
        account,
        debit: fromMillimes(finalDebit),
        credit: fromMillimes(finalCredit),
        label: (pick(row, ['libelle', 'libellé', 'label']) || 'À-nouveau importé').slice(0, 300),
      });
    }
    const totalDebit = lines.reduce((sum, line) => sum + toMillimes(line.debit), 0n);
    const totalCredit = lines.reduce((sum, line) => sum + toMillimes(line.credit), 0n);
    if (!lines.length)
      throw new BadRequestException('Aucune balance d’ouverture exploitable.');
    if (totalDebit !== totalCredit)
      throw new BadRequestException(
        `Balance non équilibrée : débit ${fromMillimes(totalDebit)} / crédit ${fromMillimes(totalCredit)}.`,
      );
    await this.dataSource.transaction(async (manager) => {
      let journal = await manager.findOne(AccountingJournal, {
        where: { organizationId, dossierId, code: 'AN' },
      });
      if (!journal) {
        journal = await manager.save(
          manager.create(AccountingJournal, {
            organizationId,
            dossierId,
            code: 'AN',
            name: 'À-nouveaux',
            type: JournalType.Miscellaneous,
            isActive: true,
          }),
        );
      }
      const entry = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: journal.id,
          entryDate: openingDate,
          pieceReference: `AN-${openingDate.slice(0, 4)}`,
          description: 'Balance d’ouverture importée',
          status: JournalEntryStatus.Draft,
          totalDebit: fromMillimes(totalDebit),
          totalCredit: fromMillimes(totalCredit),
          sourceDocumentId: null,
          createdByUserId: userId,
          postedByUserId: null,
          postedAtUtc: null,
          reversalEntryId: null,
        }),
      );
      await manager.save(
        lines.map((line) =>
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: line.account.id,
            label: line.label,
            debit: line.debit,
            credit: line.credit,
            thirdPartyName: null,
            reconciliationId: null,
            letterCode: null,
            reconciledAtUtc: null,
          }),
        ),
      );
    });
    return {
      ...result(MigrationImportKind.OpeningBalances, rows, 1, 0, warnings),
      importedLines: lines.length,
    } as ImportResult;
  }
}

function result(
  kind: MigrationImportKind,
  rows: MigrationRow[],
  created: number,
  updated: number,
  warnings: string[],
): ImportResult {
  return {
    kind,
    rows: rows.length,
    created,
    updated,
    skipped: warnings.length,
    warnings: warnings.slice(0, 30),
    sample: rows.slice(0, 10).map((row) => row.values),
  };
}

function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30);
}

function accountType(code: string) {
  const first = normalizeCode(code)[0];
  if (first === '6') return LedgerAccountType.Expense;
  if (first === '7') return LedgerAccountType.Revenue;
  if (first === '1') return LedgerAccountType.Equity;
  if (first === '2' || first === '3' || first === '5') return LedgerAccountType.Asset;
  if (first === '4') return LedgerAccountType.Asset;
  return LedgerAccountType.Asset;
}

function normalBalanceFor(type: LedgerAccountType) {
  return type === LedgerAccountType.Revenue ||
    type === LedgerAccountType.Liability ||
    type === LedgerAccountType.Equity
    ? NormalBalance.Credit
    : NormalBalance.Debit;
}

function journalType(value: string) {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (text.includes('ACH') || text === 'AC') return JournalType.Purchases;
  if (text.includes('VEN') || text === 'VT') return JournalType.Sales;
  if (text.includes('BAN') || text === 'BQ' || text === 'B') return JournalType.Bank;
  if (text.includes('CAIS') || text === 'CA') return JournalType.Cash;
  if (text.includes('PAIE')) return JournalType.Payroll;
  return JournalType.Miscellaneous;
}

function thirdPartyType(value: string) {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (text.includes('FOURN') && text.includes('CLIENT')) return ThirdPartyType.Both;
  if (text.includes('FOURN')) return ThirdPartyType.Supplier;
  return ThirdPartyType.Customer;
}

function moneyValue(value: string) {
  if (!value) return 0n;
  const raw = value
    .replace(/[\s\u00a0']/g, '')
    .replace(/[^0-9.,()\-+]/g, '');
  if (!raw) return 0n;
  const parenthesized = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw.replace(/[()]/g, '');
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    normalized = cleaned.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else if (comma >= 0) normalized = cleaned.replace(',', '.');
  if (parenthesized) normalized = `-${normalized}`;
  return toMillimes(normalized);
}
