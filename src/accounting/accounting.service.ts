import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog,
  CompanyProfile,
  FiscalYear,
  FiscalYearStatus,
  LedgerAccount,
  LedgerAccountType,
  NormalBalance,
  Organization,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  CompanyProfileDto,
  CreateFiscalYearDto,
  CreateLedgerAccountDto,
  UpdateLedgerAccountDto,
} from './dto';
import { TUNISIAN_NC01_CHART } from './tunisian-chart';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    @InjectRepository(FiscalYear)
    private readonly fiscalYears: Repository<FiscalYear>,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccounts: Repository<LedgerAccount>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    private readonly dossiers: DossiersService,
  ) {}

  async getCompanyProfile(organizationId: string) {
    const profile = await this.profiles.findOneBy({ organizationId });
    if (!profile)
      throw new NotFoundException(
        "Le profil de la société n'a pas encore été configuré.",
      );
    return this.toProfile(profile);
  }

  async upsertCompanyProfile(
    organizationId: string,
    actorUserId: string,
    dto: CompanyProfileDto,
  ) {
    if (!/^[A-Za-z]{2}$/.test(dto.countryCode))
      throw new BadRequestException(
        'Le code pays doit être un code ISO à deux lettres.',
      );
    if (!/^[A-Za-z]{3}$/.test(dto.baseCurrencyCode))
      throw new BadRequestException(
        'La devise de base doit être un code ISO à trois lettres.',
      );
    if (
      !(await this.organizations.existsBy({
        id: organizationId,
        isActive: true,
      }))
    )
      throw new NotFoundException("L'organisation est introuvable.");

    let profile = await this.profiles.findOneBy({ organizationId });
    const created = !profile;
    profile ??= this.profiles.create({ organizationId });
    Object.assign(profile, {
      legalName: dto.legalName.trim(),
      tradingName: this.clean(dto.tradingName),
      taxIdentifier: this.clean(dto.taxIdentifier),
      registrationNumber: this.clean(dto.registrationNumber),
      countryCode: dto.countryCode.toUpperCase(),
      baseCurrencyCode: dto.baseCurrencyCode.toUpperCase(),
      addressLine1: this.clean(dto.addressLine1),
      addressLine2: this.clean(dto.addressLine2),
      city: this.clean(dto.city),
      postalCode: this.clean(dto.postalCode),
      phone: this.clean(dto.phone),
      email: this.clean(dto.email),
    });
    await this.profiles.save(profile);
    await this.addAudit(
      organizationId,
      actorUserId,
      created ? 'company_profile.created' : 'company_profile.updated',
      'CompanyProfile',
      profile.id,
      {
        legalName: profile.legalName,
        countryCode: profile.countryCode,
        baseCurrencyCode: profile.baseCurrencyCode,
      },
    );
    return this.toProfile(profile);
  }

  async getFiscalYears(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const items = await this.fiscalYears.find({
      where: { organizationId, dossierId },
      order: { startsOn: 'DESC' },
    });
    return items.map((item) => this.toFiscalYear(item));
  }

  async createFiscalYear(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    dto: CreateFiscalYearDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    if (dto.endsOn < dto.startsOn)
      throw new BadRequestException(
        'La date de fin doit être postérieure ou égale à la date de début.',
      );
    const overlaps = await this.fiscalYears
      .createQueryBuilder('year')
      .where('year.organization_id = :organizationId', { organizationId })
      .andWhere('year.dossier_id = :dossierId', { dossierId })
      .andWhere(':startsOn <= year.ends_on AND :endsOn >= year.starts_on', {
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
      })
      .getExists();
    if (overlaps)
      throw new ConflictException(
        'Cet exercice chevauche un exercice existant du dossier.',
      );
    const duplicate = await this.fiscalYears
      .createQueryBuilder('year')
      .where('year.dossier_id = :dossierId', { dossierId })
      .andWhere('UPPER(year.name) = UPPER(:name)', { name: dto.name.trim() })
      .getExists();
    if (duplicate)
      throw new ConflictException(
        'Un exercice portant ce nom existe déjà dans ce dossier.',
      );

    const fiscalYear = await this.fiscalYears.save(
      this.fiscalYears.create({
        organizationId,
        dossierId,
        name: dto.name.trim(),
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        status: FiscalYearStatus.Open,
        closedAtUtc: null,
        closedByUserId: null,
      }),
    );
    await this.addAudit(
      organizationId,
      actorUserId,
      'fiscal_year.created',
      'FiscalYear',
      fiscalYear.id,
      {
        dossierId,
        name: fiscalYear.name,
        startsOn: fiscalYear.startsOn,
        endsOn: fiscalYear.endsOn,
      },
    );
    return this.toFiscalYear(fiscalYear);
  }

  async closeFiscalYear(
    organizationId: string,
    dossierId: string,
    fiscalYearId: string,
    actorUserId: string,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const fiscalYear = await this.fiscalYears.findOneBy({
      id: fiscalYearId,
      organizationId,
      dossierId,
    });
    if (!fiscalYear)
      throw new NotFoundException(
        "L'exercice est introuvable dans ce dossier.",
      );
    if (fiscalYear.status === FiscalYearStatus.Closed)
      throw new ConflictException("L'exercice est déjà clôturé.");
    if (fiscalYear.endsOn > new Date().toISOString().slice(0, 10))
      throw new ConflictException(
        'Un exercice ne peut pas être clôturé avant sa date de fin.',
      );
    Object.assign(fiscalYear, {
      status: FiscalYearStatus.Closed,
      closedAtUtc: new Date(),
      closedByUserId: actorUserId,
    });
    await this.fiscalYears.save(fiscalYear);
    await this.addAudit(
      organizationId,
      actorUserId,
      'fiscal_year.closed',
      'FiscalYear',
      fiscalYear.id,
      { dossierId, name: fiscalYear.name },
    );
    return this.toFiscalYear(fiscalYear);
  }

  async getLedgerAccounts(
    organizationId: string,
    dossierId: string,
    userId: string,
    includeInactive: boolean,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const items = await this.ledgerAccounts.find({
      where: includeInactive
        ? { organizationId, dossierId }
        : { organizationId, dossierId, isActive: true },
      order: { code: 'ASC' },
    });
    return items.map((item) => this.toLedgerAccount(item));
  }

  async createLedgerAccount(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    dto: CreateLedgerAccountDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const parsed = await this.validateAccount(
      organizationId,
      dossierId,
      null,
      dto,
      true,
    );
    const account = await this.ledgerAccounts.save(
      this.ledgerAccounts.create({
        organizationId,
        dossierId,
        code: dto.code.trim(),
        normalizedCode: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        description: this.clean(dto.description),
        type: parsed.type,
        normalBalance: parsed.normalBalance,
        parentAccountId: dto.parentAccountId ?? null,
        allowsPosting: dto.allowsPosting,
        isActive: true,
      }),
    );
    await this.addAudit(
      organizationId,
      actorUserId,
      'ledger_account.created',
      'LedgerAccount',
      account.id,
      {
        dossierId,
        code: account.code,
        name: account.name,
        type: account.type,
      },
    );
    return this.toLedgerAccount(account);
  }

  async applyTunisianChart(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const result = await this.ledgerAccounts.manager.transaction(
      async (manager) => {
        const existing = await manager.find(LedgerAccount, {
          where: { organizationId, dossierId },
        });
        const byCode = new Map(
          existing.map((item) => [item.normalizedCode, item]),
        );
        let added = 0;
        for (const definition of TUNISIAN_NC01_CHART.sort(
          (a, b) =>
            a.code.length - b.code.length || a.code.localeCompare(b.code),
        )) {
          const normalizedCode = this.normalizeCode(definition.code);
          if (byCode.has(normalizedCode)) continue;
          const parent = definition.parentCode
            ? byCode.get(this.normalizeCode(definition.parentCode))
            : null;
          const account = await manager.save(
            manager.create(LedgerAccount, {
              organizationId,
              dossierId,
              code: definition.code,
              normalizedCode,
              name: definition.name,
              description:
                'Nomenclature générale tunisienne NC 01. Subdivisions personnalisables par dossier.',
              type: definition.type,
              normalBalance: definition.normalBalance,
              parentAccountId: parent?.id ?? null,
              allowsPosting: definition.allowsPosting,
              isActive: true,
            }),
          );
          byCode.set(normalizedCode, account);
          added += 1;
        }
        return {
          added,
          skipped: TUNISIAN_NC01_CHART.length - added,
          total: TUNISIAN_NC01_CHART.length,
          reference: 'NC 01',
        };
      },
    );
    await this.addAudit(
      organizationId,
      actorUserId,
      'ledger_accounts.tunisian_chart_applied',
      'ClientDossier',
      dossierId,
      result,
    );
    return result;
  }

  // Alias conservé pour les anciens clients API.
  applyStarterChart(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
  ) {
    return this.applyTunisianChart(organizationId, dossierId, actorUserId);
  }

  async updateLedgerAccount(
    organizationId: string,
    dossierId: string,
    accountId: string,
    actorUserId: string,
    dto: UpdateLedgerAccountDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const account = await this.ledgerAccounts.findOneBy({
      id: accountId,
      organizationId,
      dossierId,
    });
    if (!account)
      throw new NotFoundException(
        'Le compte comptable est introuvable dans ce dossier.',
      );
    const parsed = await this.validateAccount(
      organizationId,
      dossierId,
      accountId,
      dto,
      dto.isActive,
    );
    if (
      !dto.isActive &&
      (await this.ledgerAccounts.existsBy({
        parentAccountId: accountId,
        dossierId,
        isActive: true,
      }))
    )
      throw new ConflictException(
        'Désactivez les sous-comptes actifs avant leur compte parent.',
      );
    Object.assign(account, {
      code: dto.code.trim(),
      normalizedCode: this.normalizeCode(dto.code),
      name: dto.name.trim(),
      description: this.clean(dto.description),
      type: parsed.type,
      normalBalance: parsed.normalBalance,
      parentAccountId: dto.parentAccountId ?? null,
      allowsPosting: dto.allowsPosting,
      isActive: dto.isActive,
    });
    await this.ledgerAccounts.save(account);
    await this.addAudit(
      organizationId,
      actorUserId,
      'ledger_account.updated',
      'LedgerAccount',
      account.id,
      {
        dossierId,
        code: account.code,
        name: account.name,
        isActive: account.isActive,
      },
    );
    return this.toLedgerAccount(account);
  }

  private async validateAccount(
    organizationId: string,
    dossierId: string,
    accountId: string | null,
    dto: CreateLedgerAccountDto,
    isActive: boolean,
  ) {
    const type = this.parseAccountType(dto.type);
    const normalBalance = this.parseNormalBalance(dto.normalBalance);
    const duplicate = await this.ledgerAccounts
      .createQueryBuilder('account')
      .where('account.organization_id = :organizationId', { organizationId })
      .andWhere('account.dossier_id = :dossierId', { dossierId })
      .andWhere('account.normalized_code = :code', {
        code: this.normalizeCode(dto.code),
      })
      .andWhere(accountId ? 'account.id != :accountId' : '1=1', { accountId })
      .getExists();
    if (duplicate)
      throw new ConflictException(
        'Un compte portant ce code existe déjà dans ce dossier.',
      );
    if (dto.parentAccountId) {
      if (dto.parentAccountId === accountId)
        throw new BadRequestException(
          'Un compte ne peut pas être son propre parent.',
        );
      const parent = await this.ledgerAccounts.findOneBy({
        id: dto.parentAccountId,
        organizationId,
        dossierId,
      });
      if (!parent)
        throw new NotFoundException(
          'Le compte parent est introuvable dans ce dossier.',
        );
      if (!parent.isActive && isActive)
        throw new ConflictException(
          'Un compte actif ne peut pas dépendre d’un parent inactif.',
        );
      const visited = new Set<string>();
      let ancestorId = parent.parentAccountId;
      while (ancestorId && !visited.has(ancestorId)) {
        if (ancestorId === accountId)
          throw new ConflictException('Le compte parent créerait un cycle.');
        visited.add(ancestorId);
        const ancestor = await this.ledgerAccounts.findOneBy({
          id: ancestorId,
          organizationId,
          dossierId,
        });
        ancestorId = ancestor?.parentAccountId ?? null;
      }
    }
    return { type, normalBalance };
  }

  private parseAccountType(value: string): LedgerAccountType {
    const normalized = this.normalizeFrench(value);
    const map: Record<string, LedgerAccountType> = {
      actif: LedgerAccountType.Asset,
      asset: LedgerAccountType.Asset,
      passif: LedgerAccountType.Liability,
      liability: LedgerAccountType.Liability,
      capitauxpropres: LedgerAccountType.Equity,
      equity: LedgerAccountType.Equity,
      produit: LedgerAccountType.Revenue,
      revenue: LedgerAccountType.Revenue,
      charge: LedgerAccountType.Expense,
      expense: LedgerAccountType.Expense,
      horsbilan: LedgerAccountType.OffBalanceSheet,
      offbalancesheet: LedgerAccountType.OffBalanceSheet,
    };
    const parsed = map[normalized];
    if (!parsed)
      throw new BadRequestException('Type de compte non pris en charge.');
    return parsed;
  }

  private parseNormalBalance(value: string): NormalBalance {
    const normalized = this.normalizeFrench(value);
    if (normalized === 'debit') return NormalBalance.Debit;
    if (normalized === 'credit') return NormalBalance.Credit;
    throw new BadRequestException('Sens normal non pris en charge.');
  }

  private toProfile(profile: CompanyProfile) {
    return {
      id: profile.id,
      organizationId: profile.organizationId,
      legalName: profile.legalName,
      tradingName: profile.tradingName,
      taxIdentifier: profile.taxIdentifier,
      registrationNumber: profile.registrationNumber,
      countryCode: profile.countryCode,
      baseCurrencyCode: profile.baseCurrencyCode,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      postalCode: profile.postalCode,
      phone: profile.phone,
      email: profile.email,
    };
  }

  private toFiscalYear(item: FiscalYear) {
    return {
      id: item.id,
      organizationId: item.organizationId,
      dossierId: item.dossierId,
      name: item.name,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      status: item.status,
      closedAtUtc: item.closedAtUtc,
      closedByUserId: item.closedByUserId,
    };
  }

  private toLedgerAccount(item: LedgerAccount) {
    return {
      id: item.id,
      organizationId: item.organizationId,
      dossierId: item.dossierId,
      code: item.code,
      name: item.name,
      description: item.description,
      type: item.type,
      normalBalance: item.normalBalance,
      parentAccountId: item.parentAccountId,
      allowsPosting: item.allowsPosting,
      isActive: item.isActive,
    };
  }

  private async addAudit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>,
  ) {
    await this.auditLogs.save(
      this.auditLogs.create({
        organizationId,
        actorUserId,
        action,
        entityType,
        entityId,
        detailsJson: details,
      }),
    );
  }

  private normalizeCode(value: string) {
    return value.trim().replace(/\s+/g, '').toUpperCase();
  }
  private normalizeFrench(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();
  }
  private clean(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
