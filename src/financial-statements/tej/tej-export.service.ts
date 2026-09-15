import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toMillimes } from '../../common/money';
import { ClientDossier } from '../../database/entities';
import { DossiersService } from '../../dossiers/dossiers.service';
import {
  F6001_LEAF_MAPPING,
  F6002_LEAF_MAPPING,
  F6002_N1_OFFSET,
  F6003_LEAF_MAPPING,
  F6003_N1_OFFSET,
  NETTED_TIERS_CATEGORIES,
} from './tej-mapping';
import { TEJ_FIELDS } from './tej-fields';

const FIELDS = TEJ_FIELDS as unknown as Record<
  'F6001' | 'F6002' | 'F6003',
  Array<{
    code: string;
    label: string;
    type: string;
    formula: Array<{ code: string; sign: 1 | -1 }> | null;
  }>
>;

export interface TejGenerationResult {
  files: Array<{ name: string; xml: string }>;
  coverage: {
    totalLeafFields: number;
    mappedLeafFields: number;
    zeroValueLeafFields: number;
  };
}

@Injectable()
export class TejExportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dossiers: DossiersService,
  ) {}

  async generate(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
  ): Promise<TejGenerationResult> {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    if (!dossier.taxIdentifier)
      throw new NotFoundException(
        'Renseignez la matricule fiscale du dossier avant de générer la liasse TEJ.',
      );

    const current = this.fiscalRange(dossier, year);
    const previous = this.fiscalRange(dossier, year - 1);
    const [currentBalances, previousBalances] = await Promise.all([
      this.accountBalances(
        organizationId,
        dossierId,
        current.startsOn,
        current.endsOn,
      ),
      this.accountBalances(
        organizationId,
        dossierId,
        previous.startsOn,
        previous.endsOn,
      ),
    ]);

    const leaves = new Map<string, bigint>();
    let mapped = 0;
    let zero = 0;
    const track = (code: string, value: bigint, isMapped: boolean) => {
      leaves.set(code, value);
      if (isMapped) mapped += 1;
      if (value === 0n) zero += 1;
    };

    // --- F6001 (Bilan Actif) ---
    const claimedAsset = new Set<string>();
    for (const [suffix, { brut, amort }] of Object.entries(
      F6001_LEAF_MAPPING,
    )) {
      const brutValue = this.sumDebitPositive(
        currentBalances,
        brut,
        claimedAsset,
      );
      const amortValue = this.sumDebitPositive(
        currentBalances,
        amort,
        claimedAsset,
      );
      const brutValueN1 = this.sumDebitPositive(
        previousBalances,
        brut,
        new Set(),
      );
      const amortValueN1 = this.sumDebitPositive(
        previousBalances,
        amort,
        new Set(),
      );
      track(`F6001-0-${suffix}`, brutValue, brut.length + amort.length > 0);
      track(`F6001-1-${suffix}`, amortValue, brut.length + amort.length > 0);
      track(
        `F6001-2-${suffix}`,
        brutValue - amortValue,
        brut.length + amort.length > 0,
      );
      track(
        `F6001-3-${suffix}`,
        brutValueN1 - amortValueN1,
        brut.length + amort.length > 0,
      );
    }
    for (const category of NETTED_TIERS_CATEGORIES) {
      const net = this.sumNetBalance(
        currentBalances,
        category.prefixes,
        claimedAsset,
      );
      const netN1 = this.sumNetBalance(
        previousBalances,
        category.prefixes,
        new Set(),
      );
      const assetValue = net > 0n ? net : 0n;
      const assetValueN1 = netN1 > 0n ? netN1 : 0n;
      track(`F6001-0-${category.f6001Suffix}`, assetValue, true);
      track(`F6001-1-${category.f6001Suffix}`, 0n, true);
      track(`F6001-2-${category.f6001Suffix}`, assetValue, true);
      track(`F6001-3-${category.f6001Suffix}`, assetValueN1, true);
    }
    // Residual catch-all (0067): every asset-type account not already
    // claimed by a specific leaf above.
    const residualAsset = this.sumResidual(
      currentBalances,
      'asset',
      claimedAsset,
    );
    const residualAssetN1 = this.sumResidual(
      previousBalances,
      'asset',
      new Set(),
    );
    track('F6001-0-0067', residualAsset, true);
    track('F6001-1-0067', 0n, true);
    track('F6001-2-0067', residualAsset, true);
    track('F6001-3-0067', residualAssetN1, true);

    // --- F6002 (Bilan Passif) ---
    const claimedLiability = new Set<string>();
    for (const [code, prefixes] of Object.entries(F6002_LEAF_MAPPING)) {
      const value = this.sumCreditPositive(
        currentBalances,
        prefixes,
        claimedLiability,
      );
      const valueN1 = this.sumCreditPositive(
        previousBalances,
        prefixes,
        new Set(),
      );
      const n1Code = this.offsetCode(code, F6002_N1_OFFSET);
      track(code, value, prefixes.length > 0);
      track(n1Code, valueN1, prefixes.length > 0);
    }
    for (const category of NETTED_TIERS_CATEGORIES) {
      if (!category.f6002Code) continue;
      const net = this.sumNetBalance(
        currentBalances,
        category.prefixes,
        claimedLiability,
      );
      const netN1 = this.sumNetBalance(
        previousBalances,
        category.prefixes,
        new Set(),
      );
      const liabilityValue = net < 0n ? -net : 0n;
      const liabilityValueN1 = netN1 < 0n ? -netN1 : 0n;
      track(category.f6002Code, liabilityValue, true);
      track(
        this.offsetCode(category.f6002Code, F6002_N1_OFFSET),
        liabilityValueN1,
        true,
      );
    }
    const residualLiability = this.sumResidual(
      currentBalances,
      'liability',
      claimedLiability,
    );
    const residualLiabilityN1 = this.sumResidual(
      previousBalances,
      'liability',
      new Set(),
    );
    track('F60020052', residualLiability, true);
    track('F60020105', residualLiabilityN1, true);

    // --- F6003 (État de résultats) ---
    const claimedResult = new Set<string>();
    for (const [code, { prefixes, sign }] of Object.entries(
      F6003_LEAF_MAPPING,
    )) {
      const value =
        sign === 1
          ? this.sumCreditPositive(currentBalances, prefixes, claimedResult)
          : this.sumDebitPositive(currentBalances, prefixes, claimedResult);
      const valueN1 =
        sign === 1
          ? this.sumCreditPositive(previousBalances, prefixes, new Set())
          : this.sumDebitPositive(previousBalances, prefixes, new Set());
      const n1Code = this.offsetCode(code, F6003_N1_OFFSET);
      track(code, value, prefixes.length > 0);
      track(n1Code, valueN1, prefixes.length > 0);
    }
    const residualRevenue = this.sumResidual(
      currentBalances,
      'revenue',
      claimedResult,
    );
    const residualExpense = this.sumResidual(
      currentBalances,
      'expense',
      claimedResult,
    );
    const residualResult = residualRevenue - residualExpense;
    const residualRevenueN1 = this.sumResidual(
      previousBalances,
      'revenue',
      new Set(),
    );
    const residualExpenseN1 = this.sumResidual(
      previousBalances,
      'expense',
      new Set(),
    );
    track('F60030088', residualResult, true);
    track('F60030177', residualRevenueN1 - residualExpenseN1, true);

    const entete = this.buildEntete(dossier, year, current);
    const files = [
      {
        name: 'F6001.xml',
        xml: this.serialize('F6001', entete, leaves, 'F6001-'),
      },
      { name: 'F6002.xml', xml: this.serialize('F6002', entete, leaves, '') },
      { name: 'F6003.xml', xml: this.serialize('F6003', entete, leaves, '') },
    ];

    const totalLeafFields = Object.values(FIELDS).reduce(
      (sum, fields) => sum + fields.filter((f) => !f.formula).length,
      0,
    );

    return {
      files,
      coverage: {
        totalLeafFields,
        mappedLeafFields: mapped,
        zeroValueLeafFields: zero,
      },
    };
  }

  private offsetCode(code: string, offset: number) {
    const prefix = code.slice(0, 5);
    const num = Number(code.slice(5));
    return `${prefix}${String(num + offset).padStart(4, '0')}`;
  }

  private async accountBalances(
    organizationId: string,
    dossierId: string,
    from: string,
    to: string,
  ) {
    const rows = await this.dataSource.query<
      Array<{ code: string; balance: string }>
    >(
      `SELECT a.code,
        (COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0))::numeric(18,3) AS balance
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id = l.entry_id
       JOIN accounting.ledger_accounts a ON a.id = l.account_id
       WHERE e.organization_id = $1 AND e.dossier_id = $2
         AND e.entry_date <= $3 AND e.status IN ('COMPTABILISEE','EXTOURNEE')
       GROUP BY a.code
       HAVING COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0) <> 0`,
      [organizationId, dossierId, to],
    );
    void from; // balances are cumulative as-of `to`, consistent with a bilan.
    return new Map(rows.map((r) => [r.code, toMillimes(r.balance)]));
  }

  /** Sum accounts under any of `prefixes` whose balance is debit-side
   * (negative in credit-positive convention), returning a positive
   * magnitude. Marks matched account codes in `claimed`. */
  private sumDebitPositive(
    balances: Map<string, bigint>,
    prefixes: string[],
    claimed: Set<string>,
  ) {
    let total = 0n;
    for (const [code, balance] of balances) {
      if (!prefixes.some((p) => code.startsWith(p))) continue;
      claimed.add(code);
      if (balance < 0n) total += -balance;
    }
    return total;
  }

  private sumCreditPositive(
    balances: Map<string, bigint>,
    prefixes: string[],
    claimed: Set<string>,
  ) {
    let total = 0n;
    for (const [code, balance] of balances) {
      if (!prefixes.some((p) => code.startsWith(p))) continue;
      claimed.add(code);
      if (balance > 0n) total += balance;
    }
    return total;
  }

  private sumNetBalance(
    balances: Map<string, bigint>,
    prefixes: string[],
    claimed: Set<string>,
  ) {
    let total = 0n;
    for (const [code, balance] of balances) {
      if (!prefixes.some((p) => code.startsWith(p))) continue;
      claimed.add(code);
      total += balance;
    }
    return total;
  }

  private sumResidual(
    balances: Map<string, bigint>,
    kind: 'asset' | 'liability' | 'revenue' | 'expense',
    claimed: Set<string>,
  ) {
    let total = 0n;
    for (const [code, balance] of balances) {
      if (claimed.has(code)) continue;
      const cls = code[0];
      if (
        kind === 'asset' &&
        (cls === '2' || cls === '3' || cls === '4' || cls === '5')
      ) {
        if (balance < 0n) total += -balance;
      } else if (
        kind === 'liability' &&
        (cls === '1' || cls === '4' || cls === '5')
      ) {
        if (balance > 0n) total += balance;
      } else if (kind === 'revenue' && cls === '7') {
        if (balance > 0n) total += balance;
      } else if (kind === 'expense' && cls === '6') {
        if (balance < 0n) total += -balance;
      }
    }
    return total;
  }

  private fiscalRange(dossier: ClientDossier, periodYear: number) {
    const month = dossier.fiscalYearStartMonth;
    const startDay = Math.min(
      dossier.fiscalYearStartDay,
      new Date(Date.UTC(periodYear, month, 0)).getUTCDate(),
    );
    const start = new Date(Date.UTC(periodYear, month - 1, startDay));
    const nextDay = Math.min(
      dossier.fiscalYearStartDay,
      new Date(Date.UTC(periodYear + 1, month, 0)).getUTCDate(),
    );
    const nextStart = new Date(Date.UTC(periodYear + 1, month - 1, nextDay));
    return {
      startsOn: start.toISOString().slice(0, 10),
      endsOn: new Date(nextStart.getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10),
    };
  }

  private buildEntete(
    dossier: ClientDossier,
    year: number,
    range: { startsOn: string; endsOn: string },
  ) {
    const toDdMmYyyy = (iso: string) => {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };
    return {
      MatriculeFiscalDeclarant: (dossier.taxIdentifier ?? '').replace(
        /[^0-9A-Z]/gi,
        '',
      ),
      NometPrenomouRaisonSociale: this.xmlEscape(dossier.legalName),
      Activite: this.xmlEscape(dossier.activitySector ?? 'Non précisé'),
      // ClientDossier doesn't currently store a postal address - the
      // dossier record needs one added before this can be auto-filled.
      Adresse: 'A completer',
      Exercice: String(year),
      DateDebutExercice: toDdMmYyyy(range.startsOn),
      DateClotureExercice: toDdMmYyyy(range.endsOn),
      ActeDeDepot: '0',
      NatureDepot: 'P',
    };
  }

  private xmlEscape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** Resolve every field of `form` (leaves from `leaves`, subtotals via the
   * formula tree parsed from the official XSD) and serialize to XML
   * matching that form's Entete + Details structure. */
  private serialize(
    form: 'F6001' | 'F6002' | 'F6003',
    entete: Record<string, string>,
    leaves: Map<string, bigint>,
    leafPrefix: string,
  ) {
    const fields = FIELDS[form];
    const resolved = new Map<string, bigint>();
    const resolve = (code: string, seen = new Set<string>()): bigint => {
      if (resolved.has(code)) return resolved.get(code)!;
      if (seen.has(code)) return 0n; // guard against cyclic refs
      seen.add(code);
      const field = fields.find((f) => f.code === code);
      let value = 0n;
      if (field?.formula) {
        for (const term of field.formula) {
          value += BigInt(term.sign) * resolve(term.code, seen);
        }
      } else {
        const key = leafPrefix ? this.leafKey(form, leafPrefix, code) : code;
        value = leaves.get(key) ?? 0n;
      }
      resolved.set(code, value);
      return value;
    };

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<lf:${form} xmlns:lf="http://www.impots.finances.gov.tn/liasse">`,
    );
    lines.push('  <lf:VersionDocument>1.0</lf:VersionDocument>');
    lines.push('  <lf:Entete>');
    for (const [key, value] of Object.entries(entete)) {
      lines.push(`    <lf:${key}>${value}</lf:${key}>`);
    }
    lines.push('  </lf:Entete>');
    lines.push('  <lf:Details>');
    for (const field of fields) {
      const value = resolve(field.code);
      lines.push(
        `    <lf:${field.code}>${fromMillimesInt(value)}</lf:${field.code}>`,
      );
    }
    lines.push('  </lf:Details>');
    lines.push(`</lf:${form}>`);
    return lines.join('\n');
  }

  /** F6001 leaves are keyed internally as F6001-{variant}-{suffix}; map
   * the official field code (e.g. F60010004, where "F6001" + variant
   * digit "0" + 3-digit suffix "004") back to that internal key, which
   * uses the 4-digit zero-padded suffix from F6001_LEAF_MAPPING. */
  private leafKey(form: string, prefix: string, code: string) {
    if (form !== 'F6001') return code;
    const variant = code[5];
    const suffix = code.slice(6).padStart(4, '0');
    return `${prefix}${variant}-${suffix}`;
  }
}

function fromMillimesInt(value: bigint) {
  // DGI XSD amount fields are integers (no decimal places): round to the
  // nearest dinar from our millimes-precision internal amounts.
  const millimes = value;
  const dinars = millimes / 1000n;
  const remainder = millimes % 1000n;
  const rounded =
    remainder * 2n >= 1000n
      ? dinars + 1n
      : remainder * -2n >= 1000n
        ? dinars - 1n
        : dinars;
  return rounded.toString();
}
