import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, MoreThan, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AccountingJournal,
  AssetDepreciationPeriod,
  AssetDepreciationYear,
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
  DepreciationMethod,
  DepreciationPeriodStatus,
  DepreciationYearStatus,
  FixedAsset,
  FixedAssetCategory,
  FixedAssetStatus,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalType,
  LedgerAccount,
  ThirdParty,
  ThirdPartyType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { generateDepreciationPlan } from './depreciation.engine';
import {
  CreateFixedAssetCategoryDto,
  CreateFixedAssetDto,
  DisposeFixedAssetDto,
} from './dto';
import { PeriodLockService } from '../period-closing/period-lock.service';

@Injectable()
export class FixedAssetsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FixedAssetCategory)
    private readonly categories: Repository<FixedAssetCategory>,
    @InjectRepository(FixedAsset)
    private readonly assets: Repository<FixedAsset>,
    @InjectRepository(AssetDepreciationPeriod)
    private readonly periods: Repository<AssetDepreciationPeriod>,
    @InjectRepository(AssetDepreciationYear)
    private readonly years: Repository<AssetDepreciationYear>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    @InjectRepository(BusinessInvoice)
    private readonly invoices: Repository<BusinessInvoice>,
    @InjectRepository(ThirdParty)
    private readonly thirdParties: Repository<ThirdParty>,
    private readonly dossiers: DossiersService,
    private readonly periodLocks: PeriodLockService,
  ) {}

  async listCategories(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.categories.find({
      where: { organizationId, dossierId, isActive: true },
      relations: {
        assetAccount: true,
        accumulatedDepreciationAccount: true,
        depreciationExpenseAccount: true,
      },
      order: { code: 'ASC' },
    });
  }

  async createCategory(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateFixedAssetCategoryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.ensureYearOpen(
      organizationId,
      dossierId,
      new Date().getFullYear(),
    );
    const accountIds = [
      dto.assetAccountId,
      dto.accumulatedDepreciationAccountId,
      dto.depreciationExpenseAccountId,
    ];
    if (new Set(accountIds).size !== accountIds.length)
      throw new BadRequestException(
        'Les trois comptes de la catégorie doivent être différents.',
      );
    await this.validateAccountIds(organizationId, dossierId, accountIds);
    this.validateDecliningRate(dto.defaultMethod, dto.defaultDecliningRate);
    if (
      await this.categories.existsBy({
        dossierId,
        code: dto.code.trim().toUpperCase(),
      })
    )
      throw new ConflictException('Ce code de catégorie existe déjà.');
    return this.categories.save(
      this.categories.create({
        organizationId,
        dossierId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        assetAccountId: dto.assetAccountId,
        accumulatedDepreciationAccountId: dto.accumulatedDepreciationAccountId,
        depreciationExpenseAccountId: dto.depreciationExpenseAccountId,
        defaultMethod: dto.defaultMethod,
        defaultUsefulLifeMonths: dto.defaultUsefulLifeMonths,
        defaultDecliningRate: dto.defaultDecliningRate ?? null,
        isActive: true,
      }),
    );
  }

  async listAssets(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.assets.find({
      where: { organizationId, dossierId },
      relations: { category: true, supplier: true, purchaseInvoice: true },
      order: { serviceDate: 'DESC', code: 'ASC' },
      take: 1000,
    });
  }

  async getAsset(
    organizationId: string,
    dossierId: string,
    assetId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.findAsset(organizationId, dossierId, assetId);
  }

  async createAsset(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateFixedAssetDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (dto.serviceDate < dto.acquisitionDate)
      throw new BadRequestException(
        'La mise en service ne peut pas précéder l’acquisition.',
      );
    await this.ensureYearOpen(
      organizationId,
      dossierId,
      Number(dto.serviceDate.slice(0, 4)),
    );
    const category = await this.categories.findOneBy({
      id: dto.categoryId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!category)
      throw new NotFoundException(
        'La catégorie d’immobilisation est introuvable.',
      );
    const code = dto.code.trim().toUpperCase();
    if (await this.assets.existsBy({ dossierId, code }))
      throw new ConflictException('Ce code d’immobilisation existe déjà.');
    const cost = toMillimes(dto.acquisitionCost, 'Coût d’acquisition');
    const residual = toMillimes(dto.residualValue, 'Valeur résiduelle');
    if (cost <= 0n || residual < 0n || residual >= cost)
      throw new BadRequestException(
        'Le coût doit être positif et la valeur résiduelle inférieure au coût.',
      );
    const accountingMethod = dto.accountingMethod ?? category.defaultMethod;
    const usefulLifeMonths =
      dto.usefulLifeMonths ?? category.defaultUsefulLifeMonths;
    const accountingRate =
      dto.accountingDecliningRate ?? category.defaultDecliningRate;
    this.validateDecliningRate(accountingMethod, accountingRate ?? undefined);
    this.validateDecliningRate(dto.fiscalMethod, dto.fiscalDecliningRate);

    const purchaseInvoice = dto.purchaseInvoiceId
      ? await this.invoices.findOneBy({
          id: dto.purchaseInvoiceId,
          organizationId,
          dossierId,
          type: BusinessInvoiceType.Purchase,
          kind: BusinessInvoiceKind.Invoice,
          status: BusinessInvoiceStatus.Posted,
        })
      : null;
    if (dto.purchaseInvoiceId && !purchaseInvoice)
      throw new BadRequestException(
        'La facture d’achat liée doit être comptabilisée.',
      );
    const supplierId = dto.supplierId ?? purchaseInvoice?.thirdPartyId ?? null;
    const supplier = supplierId
      ? await this.thirdParties.findOneBy({
          id: supplierId,
          organizationId,
          dossierId,
          isActive: true,
        })
      : null;
    if (
      supplierId &&
      (!supplier ||
        ![ThirdPartyType.Supplier, ThirdPartyType.Both].includes(supplier.type))
    )
      throw new BadRequestException('Le fournisseur sélectionné est invalide.');
    if (
      purchaseInvoice?.thirdPartyId &&
      supplierId !== purchaseInvoice.thirdPartyId
    )
      throw new BadRequestException(
        'Le fournisseur ne correspond pas à celui de la facture.',
      );

    return this.assets.save(
      this.assets.create({
        organizationId,
        dossierId,
        categoryId: category.id,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        acquisitionDate: dto.acquisitionDate,
        serviceDate: dto.serviceDate,
        purchaseInvoiceId: purchaseInvoice?.id ?? null,
        supplierId,
        acquisitionCost: fromMillimes(cost),
        residualValue: fromMillimes(residual),
        depreciableBase: fromMillimes(cost - residual),
        accountingMethod,
        usefulLifeMonths,
        accountingDecliningRate: accountingRate ?? null,
        fiscalMethod: dto.fiscalMethod,
        fiscalUsefulLifeMonths: dto.fiscalUsefulLifeMonths,
        fiscalDecliningRate: dto.fiscalDecliningRate ?? null,
        openingAccountingDepreciation: '0.000',
        openingFiscalDepreciation: '0.000',
        postedAccountingDepreciation: '0.000',
        netBookValue: fromMillimes(cost),
        assetAccountId: category.assetAccountId,
        accumulatedDepreciationAccountId:
          category.accumulatedDepreciationAccountId,
        depreciationExpenseAccountId: category.depreciationExpenseAccountId,
        status: FixedAssetStatus.Active,
        disposalDate: null,
        disposalProceeds: null,
        disposalGainLoss: null,
        disposalJournalEntryId: null,
        createdByUserId: userId,
      }),
    );
  }

  async generateSchedule(
    organizationId: string,
    dossierId: string,
    assetId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const asset = await this.findAsset(organizationId, dossierId, assetId);
    if (
      [FixedAssetStatus.Disposed, FixedAssetStatus.Retired].includes(
        asset.status,
      )
    )
      throw new ConflictException(
        'Le plan d’une immobilisation sortie ne peut pas être régénéré.',
      );
    if (
      await this.periods.existsBy({
        assetId: asset.id,
        status: DepreciationPeriodStatus.Posted,
      })
    )
      throw new ConflictException(
        'Le plan ne peut plus être régénéré après une comptabilisation.',
      );
    const plan = generateDepreciationPlan({
      acquisitionCost: asset.acquisitionCost,
      residualValue: asset.residualValue,
      serviceDate: asset.serviceDate,
      accountingMethod: asset.accountingMethod,
      usefulLifeMonths: asset.usefulLifeMonths,
      accountingDecliningRate: asset.accountingDecliningRate,
      fiscalMethod: asset.fiscalMethod,
      fiscalUsefulLifeMonths: asset.fiscalUsefulLifeMonths,
      fiscalDecliningRate: asset.fiscalDecliningRate,
      openingAccountingDepreciation: asset.openingAccountingDepreciation,
      openingFiscalDepreciation: asset.openingFiscalDepreciation,
    });
    const lockedYears = await this.years.findBy({
      organizationId,
      dossierId,
      periodYear: In([...new Set(plan.map((item) => item.periodYear))]),
      status: DepreciationYearStatus.Validated,
    });
    if (lockedYears.length)
      throw new ConflictException(
        `L’exercice ${lockedYears[0].periodYear} des immobilisations est clôturé.`,
      );
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(AssetDepreciationPeriod, {
        assetId: asset.id,
        status: DepreciationPeriodStatus.Planned,
      });
      await manager.save(
        plan.map((line) =>
          manager.create(AssetDepreciationPeriod, {
            organizationId,
            dossierId,
            assetId: asset.id,
            ...line,
            status: DepreciationPeriodStatus.Planned,
            journalEntryId: null,
            postedByUserId: null,
            postedAtUtc: null,
          }),
        ),
      );
    });
    return this.findAsset(organizationId, dossierId, asset.id);
  }

  async postDepreciation(
    organizationId: string,
    dossierId: string,
    periodId: string,
    journalId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.transaction(async (manager) => {
      const period = await manager.findOne(AssetDepreciationPeriod, {
        where: { id: periodId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!period)
        throw new NotFoundException(
          'La période d’amortissement est introuvable.',
        );
      if (period.status !== DepreciationPeriodStatus.Planned)
        throw new ConflictException('Cette dotation est déjà comptabilisée.');
      if (toMillimes(period.accountingAmount) <= 0n)
        throw new BadRequestException(
          'Cette période ne contient aucune dotation comptable.',
        );
      await this.periodLocks.assertDateOpen(
        organizationId,
        dossierId,
        period.periodEnd,
        manager,
      );
      await this.ensureYearOpen(
        organizationId,
        dossierId,
        period.periodYear,
        manager,
      );
      const earlier = await manager.count(AssetDepreciationPeriod, {
        where: {
          assetId: period.assetId,
          periodEnd: LessThan(period.periodEnd),
          accountingAmount: MoreThan('0.000'),
          status: DepreciationPeriodStatus.Planned,
        },
      });
      if (earlier)
        throw new ConflictException(
          'Comptabilisez d’abord les périodes antérieures de cette immobilisation.',
        );
      const [asset, journal] = await Promise.all([
        manager.findOneByOrFail(FixedAsset, {
          id: period.assetId,
          organizationId,
          dossierId,
        }),
        manager.findOneBy(AccountingJournal, {
          id: journalId,
          organizationId,
          dossierId,
          isActive: true,
        }),
      ]);
      if (!journal || journal.type !== JournalType.Miscellaneous)
        throw new BadRequestException(
          'Les amortissements doivent utiliser un journal d’opérations diverses.',
        );
      if (
        [FixedAssetStatus.Disposed, FixedAssetStatus.Retired].includes(
          asset.status,
        )
      )
        throw new ConflictException('Cette immobilisation est déjà sortie.');
      const amount = toMillimes(period.accountingAmount);
      const entry = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: journal.id,
          entryDate: period.periodEnd,
          pieceReference:
            `AMORT-${asset.code}-${period.periodYear}-${String(period.periodMonth).padStart(2, '0')}`.slice(
              0,
              100,
            ),
          description: `Dotation aux amortissements - ${asset.name}`.slice(
            0,
            300,
          ),
          status: JournalEntryStatus.Posted,
          totalDebit: fromMillimes(amount),
          totalCredit: fromMillimes(amount),
          sourceDocumentId: null,
          createdByUserId: userId,
          postedByUserId: userId,
          postedAtUtc: new Date(),
          reversalEntryId: null,
        }),
      );
      await manager.save([
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: entry.id,
          accountId: asset.depreciationExpenseAccountId,
          label: `Dotation ${asset.name}`.slice(0, 300),
          debit: fromMillimes(amount),
          credit: '0.000',
          thirdPartyName: null,
        }),
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: entry.id,
          accountId: asset.accumulatedDepreciationAccountId,
          label: `Amortissement cumulé ${asset.name}`.slice(0, 300),
          debit: '0.000',
          credit: fromMillimes(amount),
          thirdPartyName: null,
        }),
      ]);
      period.status = DepreciationPeriodStatus.Posted;
      period.journalEntryId = entry.id;
      period.postedByUserId = userId;
      period.postedAtUtc = new Date();
      await manager.save(period);
      const posted = toMillimes(asset.postedAccountingDepreciation) + amount;
      asset.postedAccountingDepreciation = fromMillimes(posted);
      const netBookValue =
        toMillimes(asset.acquisitionCost) -
        toMillimes(asset.openingAccountingDepreciation) -
        posted;
      asset.netBookValue = fromMillimes(netBookValue);
      if (netBookValue <= toMillimes(asset.residualValue))
        asset.status = FixedAssetStatus.FullyDepreciated;
      await manager.save(asset);
      return manager.findOneOrFail(AssetDepreciationPeriod, {
        where: { id: period.id },
        relations: { asset: true, journalEntry: true },
      });
    });
  }

  async disposeAsset(
    organizationId: string,
    dossierId: string,
    assetId: string,
    userId: string,
    dto: DisposeFixedAssetDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      dto.disposalDate,
    );
    return this.dataSource.transaction(async (manager) => {
      const asset = await manager.findOne(FixedAsset, {
        where: { id: assetId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!asset)
        throw new NotFoundException('L’immobilisation est introuvable.');
      if (
        [FixedAssetStatus.Disposed, FixedAssetStatus.Retired].includes(
          asset.status,
        )
      )
        throw new ConflictException('Cette immobilisation est déjà sortie.');
      if (dto.disposalDate < asset.serviceDate)
        throw new BadRequestException(
          'La date de sortie ne peut pas précéder la mise en service.',
        );
      await this.ensureYearOpen(
        organizationId,
        dossierId,
        Number(dto.disposalDate.slice(0, 4)),
        manager,
      );
      if (
        await manager.exists(AssetDepreciationPeriod, {
          where: {
            assetId: asset.id,
            periodEnd: MoreThan(dto.disposalDate),
            status: DepreciationPeriodStatus.Posted,
          },
        })
      )
        throw new ConflictException(
          'Une dotation postérieure à la sortie est déjà comptabilisée.',
        );
      const journal = await manager.findOneBy(AccountingJournal, {
        id: dto.journalId,
        organizationId,
        dossierId,
        isActive: true,
      });
      if (!journal || journal.type !== JournalType.Miscellaneous)
        throw new BadRequestException(
          'La sortie doit utiliser un journal d’opérations diverses.',
        );
      await this.validateAccountIds(
        organizationId,
        dossierId,
        [dto.settlementAccountId, dto.gainAccountId, dto.lossAccountId],
        manager,
      );
      const proceeds = toMillimes(dto.proceeds, 'Prix de cession');
      const cost = toMillimes(asset.acquisitionCost);
      const accumulated =
        toMillimes(asset.openingAccountingDepreciation) +
        toMillimes(asset.postedAccountingDepreciation);
      const netBookValue = cost - accumulated;
      const gainLoss = proceeds - netBookValue;
      const entry = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: journal.id,
          entryDate: dto.disposalDate,
          pieceReference: `SORTIE-${asset.code}`.slice(0, 100),
          description:
            `${proceeds > 0n ? 'Cession' : 'Mise au rebut'} - ${asset.name}`.slice(
              0,
              300,
            ),
          status: JournalEntryStatus.Posted,
          totalDebit: fromMillimes(cost + (gainLoss > 0n ? gainLoss : 0n)),
          totalCredit: fromMillimes(cost + (gainLoss > 0n ? gainLoss : 0n)),
          sourceDocumentId: null,
          createdByUserId: userId,
          postedByUserId: userId,
          postedAtUtc: new Date(),
          reversalEntryId: null,
        }),
      );
      const lines: JournalEntryLine[] = [];
      if (accumulated > 0n)
        lines.push(
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: asset.accumulatedDepreciationAccountId,
            label: `Reprise amortissements ${asset.name}`.slice(0, 300),
            debit: fromMillimes(accumulated),
            credit: '0.000',
            thirdPartyName: null,
          }),
        );
      if (proceeds > 0n)
        lines.push(
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: dto.settlementAccountId,
            label: `Prix de cession ${asset.name}`.slice(0, 300),
            debit: fromMillimes(proceeds),
            credit: '0.000',
            thirdPartyName: null,
          }),
        );
      if (gainLoss < 0n)
        lines.push(
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: dto.lossAccountId,
            label: `Moins-value ${asset.name}`.slice(0, 300),
            debit: fromMillimes(-gainLoss),
            credit: '0.000',
            thirdPartyName: null,
          }),
        );
      lines.push(
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: entry.id,
          accountId: asset.assetAccountId,
          label: `Sortie actif ${asset.name}`.slice(0, 300),
          debit: '0.000',
          credit: fromMillimes(cost),
          thirdPartyName: null,
        }),
      );
      if (gainLoss > 0n)
        lines.push(
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: dto.gainAccountId,
            label: `Plus-value ${asset.name}`.slice(0, 300),
            debit: '0.000',
            credit: fromMillimes(gainLoss),
            thirdPartyName: null,
          }),
        );
      const totalDebit = lines.reduce(
        (sum, line) => sum + toMillimes(line.debit),
        0n,
      );
      const totalCredit = lines.reduce(
        (sum, line) => sum + toMillimes(line.credit),
        0n,
      );
      if (totalDebit !== totalCredit)
        throw new BadRequestException(
          'L’écriture de sortie générée est déséquilibrée.',
        );
      entry.totalDebit = fromMillimes(totalDebit);
      entry.totalCredit = fromMillimes(totalCredit);
      await manager.save(entry);
      await manager.save(lines);
      await manager.delete(AssetDepreciationPeriod, {
        assetId: asset.id,
        periodEnd: MoreThan(dto.disposalDate),
        status: DepreciationPeriodStatus.Planned,
      });
      asset.status =
        proceeds > 0n ? FixedAssetStatus.Disposed : FixedAssetStatus.Retired;
      asset.disposalDate = dto.disposalDate;
      asset.disposalProceeds = fromMillimes(proceeds);
      asset.disposalGainLoss = fromMillimes(gainLoss);
      asset.disposalJournalEntryId = entry.id;
      await manager.save(asset);
      return manager.findOneOrFail(FixedAsset, {
        where: { id: asset.id },
        relations: { category: true, disposalJournalEntry: true },
      });
    });
  }

  async depreciationReport(
    organizationId: string,
    dossierId: string,
    year: number,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const periods = await this.periods.find({
      where: { organizationId, dossierId, periodYear: year },
      relations: { asset: { category: true } },
      order: { asset: { code: 'ASC' }, periodMonth: 'ASC' },
    });
    const byAsset = new Map<
      string,
      {
        assetId: string;
        code: string;
        name: string;
        category: string;
        accounting: bigint;
        fiscal: bigint;
        difference: bigint;
        posted: number;
        periods: number;
      }
    >();
    for (const period of periods) {
      const row = byAsset.get(period.assetId) ?? {
        assetId: period.assetId,
        code: period.asset.code,
        name: period.asset.name,
        category: period.asset.category.name,
        accounting: 0n,
        fiscal: 0n,
        difference: 0n,
        posted: 0,
        periods: 0,
      };
      row.accounting += toMillimes(period.accountingAmount);
      row.fiscal += toMillimes(period.fiscalAmount);
      row.difference += toMillimes(period.temporaryDifference);
      row.periods += 1;
      if (period.status === DepreciationPeriodStatus.Posted) row.posted += 1;
      byAsset.set(period.assetId, row);
    }
    const rows = [...byAsset.values()].map((row) => ({
      ...row,
      accounting: fromMillimes(row.accounting),
      fiscal: fromMillimes(row.fiscal),
      temporaryDifference: fromMillimes(row.difference),
      difference: undefined,
    }));
    const totals = rows.reduce(
      (total, row) => ({
        accounting: total.accounting + toMillimes(row.accounting),
        fiscal: total.fiscal + toMillimes(row.fiscal),
        difference: total.difference + toMillimes(row.temporaryDifference),
      }),
      { accounting: 0n, fiscal: 0n, difference: 0n },
    );
    const closing = await this.years.findOneBy({
      organizationId,
      dossierId,
      periodYear: year,
    });
    return {
      year,
      status: closing?.status ?? DepreciationYearStatus.Open,
      rows,
      totals: {
        accounting: fromMillimes(totals.accounting),
        fiscal: fromMillimes(totals.fiscal),
        temporaryDifference: fromMillimes(totals.difference),
      },
    };
  }

  async listYears(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.years.find({
      where: { organizationId, dossierId },
      order: { periodYear: 'DESC' },
    });
  }

  async validateYear(
    organizationId: string,
    dossierId: string,
    year: number,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(AssetDepreciationYear, {
        where: { organizationId, dossierId, periodYear: year },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing?.status === DepreciationYearStatus.Validated)
        throw new ConflictException('Cet exercice est déjà clôturé.');
      const unscheduled = await manager.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
         FROM accounting.fixed_assets a
         WHERE a.organization_id=$1 AND a.dossier_id=$2
           AND a.service_date <= $3
           AND a.status IN ('ACTIVE','TOTALEMENT_AMORTIE')
           AND NOT EXISTS (
             SELECT 1 FROM accounting.asset_depreciation_periods p
             WHERE p.asset_id=a.id
           )`,
        [organizationId, dossierId, `${year}-12-31`],
      );
      if (Number(unscheduled[0]?.count ?? 0) > 0)
        throw new ConflictException(
          'Générez le plan de toutes les immobilisations avant la clôture.',
        );
      const unposted = await manager.count(AssetDepreciationPeriod, {
        where: {
          organizationId,
          dossierId,
          periodYear: year,
          accountingAmount: MoreThan('0.000'),
          status: DepreciationPeriodStatus.Planned,
        },
      });
      if (unposted)
        throw new ConflictException(
          `${unposted} dotation(s) comptable(s) restent à comptabiliser.`,
        );
      const sums = await manager.query<
        Array<{ accounting: string; fiscal: string; difference: string }>
      >(
        `SELECT COALESCE(SUM(accounting_amount),0)::numeric(15,3) AS accounting,
                COALESCE(SUM(fiscal_amount),0)::numeric(15,3) AS fiscal,
                COALESCE(SUM(temporary_difference),0)::numeric(15,3) AS difference
         FROM accounting.asset_depreciation_periods
         WHERE organization_id=$1 AND dossier_id=$2 AND period_year=$3`,
        [organizationId, dossierId, year],
      );
      const totals = sums[0];
      const closing = existing ?? manager.create(AssetDepreciationYear);
      Object.assign(closing, {
        organizationId,
        dossierId,
        periodYear: year,
        totalAccounting: totals.accounting,
        totalFiscal: totals.fiscal,
        temporaryDifference: totals.difference,
        status: DepreciationYearStatus.Validated,
        validatedByUserId: userId,
        validatedAtUtc: new Date(),
      });
      return manager.save(closing);
    });
  }

  private async findAsset(
    organizationId: string,
    dossierId: string,
    assetId: string,
  ) {
    const asset = await this.assets.findOne({
      where: { id: assetId, organizationId, dossierId },
      relations: {
        category: true,
        supplier: true,
        purchaseInvoice: true,
        disposalJournalEntry: true,
        depreciationPeriods: { journalEntry: true },
      },
      order: {
        depreciationPeriods: { periodYear: 'ASC', periodMonth: 'ASC' },
      },
    });
    if (!asset)
      throw new NotFoundException('L’immobilisation est introuvable.');
    return asset;
  }

  private validateDecliningRate(method: DepreciationMethod, rate?: string) {
    if (method === DepreciationMethod.DecliningBalance && !rate)
      throw new BadRequestException(
        'Le taux est obligatoire pour un amortissement dégressif.',
      );
  }

  private async validateAccountIds(
    organizationId: string,
    dossierId: string,
    ids: string[],
    manager = this.dataSource.manager,
  ) {
    const unique = [...new Set(ids)];
    const count = await manager.count(LedgerAccount, {
      where: {
        id: In(unique),
        organizationId,
        dossierId,
        isActive: true,
        allowsPosting: true,
      },
    });
    if (count !== unique.length)
      throw new BadRequestException(
        'Un compte comptable est inexistant, inactif ou non mouvementable.',
      );
  }

  private async ensureYearOpen(
    organizationId: string,
    dossierId: string,
    year: number,
    manager = this.dataSource.manager,
  ) {
    if (
      await manager.exists(AssetDepreciationYear, {
        where: {
          organizationId,
          dossierId,
          periodYear: year,
          status: DepreciationYearStatus.Validated,
        },
      })
    )
      throw new ConflictException(
        `L’exercice ${year} des immobilisations est clôturé.`,
      );
  }
}
