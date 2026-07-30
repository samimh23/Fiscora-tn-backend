import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { fromMillimes, multiplyRate, toMillimes } from '../common/money';
import {
  AccountingDocument,
  AccountingJournal,
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceLine,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
  CommercialDocument,
  CommercialDocumentDirection,
  CommercialDocumentKind,
  CommercialDocumentStatus,
  FiscalParameterCode,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalType,
  LedgerAccount,
  InvoiceSettlementStatus,
  OrganizationMembership,
  ThirdParty,
  ThirdPartyType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { FiscalSettingsService } from '../fiscal-settings/fiscal-settings.service';
import { SaveBusinessInvoiceDto } from './dto';
import { PeriodLockService } from '../period-closing/period-lock.service';
import { SystemRoleNames } from '../database/permissions';

@Injectable()
export class BusinessInvoicesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BusinessInvoice)
    private readonly invoices: Repository<BusinessInvoice>,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(ThirdParty)
    private readonly thirdParties: Repository<ThirdParty>,
    @InjectRepository(CommercialDocument)
    private readonly commercialDocuments: Repository<CommercialDocument>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    private readonly dossiers: DossiersService,
    private readonly fiscalSettings: FiscalSettingsService,
    private readonly periodLocks: PeriodLockService,
  ) {}

  async list(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const isClient = await this.isClient(organizationId, userId);
    return this.invoices.find({
      where: {
        organizationId,
        dossierId,
        ...(isClient ? { status: BusinessInvoiceStatus.Posted } : {}),
      },
      relations: {
        journal: true,
        thirdParty: true,
        thirdPartyAccount: true,
        lines: { account: true },
      },
      order: { invoiceDate: 'DESC', createdAtUtc: 'DESC' },
      take: 500,
    });
  }

  async get(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const invoice = await this.find(organizationId, dossierId, invoiceId);
    if (
      invoice.status !== BusinessInvoiceStatus.Posted &&
      (await this.isClient(organizationId, userId))
    ) {
      throw new NotFoundException('La facture est introuvable.');
    }
    return invoice;
  }

  async save(
    organizationId: string,
    dossierId: string,
    invoiceId: string | null,
    userId: string,
    dto: SaveBusinessInvoiceDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const existing = invoiceId
      ? await this.find(organizationId, dossierId, invoiceId)
      : null;
    if (existing && existing.status !== BusinessInvoiceStatus.Draft)
      throw new ConflictException(
        'Seule une facture en brouillon peut être modifiée.',
      );
    const duplicate = await this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.dossier_id = :dossierId', { dossierId })
      .andWhere('invoice.type = :type', { type: dto.type })
      .andWhere('invoice.kind = :kind', { kind: dto.kind })
      .andWhere('UPPER(invoice.number) = UPPER(:number)', {
        number: dto.number.trim(),
      })
      .andWhere(invoiceId ? 'invoice.id != :invoiceId' : '1=1', { invoiceId })
      .getExists();
    if (duplicate)
      throw new ConflictException(
        'Une facture du même type porte déjà ce numéro.',
      );
    const thirdParty = dto.thirdPartyId
      ? await this.thirdParties.findOneBy({
          id: dto.thirdPartyId,
          organizationId,
          dossierId,
          isActive: true,
        })
      : null;
    if (dto.thirdPartyId && !thirdParty)
      throw new NotFoundException('Le client ou fournisseur est introuvable.');
    if (
      thirdParty &&
      thirdParty.type !== ThirdPartyType.Both &&
      ((dto.type === BusinessInvoiceType.Sale &&
        thirdParty.type !== ThirdPartyType.Customer) ||
        (dto.type === BusinessInvoiceType.Purchase &&
          thirdParty.type !== ThirdPartyType.Supplier))
    )
      throw new BadRequestException(
        'Le type du tiers ne correspond pas au type de la facture.',
      );
    const journal = await this.journals.findOneBy({
      id: dto.journalId,
      organizationId,
      dossierId,
      isActive: true,
    });
    const expectedJournal =
      dto.type === BusinessInvoiceType.Purchase
        ? JournalType.Purchases
        : JournalType.Sales;
    if (!journal || journal.type !== expectedJournal)
      throw new BadRequestException(
        `Sélectionnez un journal de ${dto.type === BusinessInvoiceType.Purchase ? 'achats' : 'ventes'}.`,
      );
    if (
      dto.sourceDocumentId &&
      !(await this.documents.existsBy({
        id: dto.sourceDocumentId,
        organizationId,
        dossierId,
        deletedAtUtc: IsNull(),
      }))
    )
      throw new NotFoundException('Le document source est introuvable.');
    const commercialSource = dto.sourceCommercialDocumentId
      ? await this.commercialDocuments.findOne({
          where: {
            id: dto.sourceCommercialDocumentId,
            organizationId,
            dossierId,
          },
          relations: { lines: true },
        })
      : null;
    if (dto.sourceCommercialDocumentId && !commercialSource)
      throw new NotFoundException(
        'Le document commercial source est introuvable.',
      );
    if (commercialSource) {
      const expectedDirection =
        dto.type === BusinessInvoiceType.Sale
          ? CommercialDocumentDirection.Sale
          : CommercialDocumentDirection.Purchase;
      const expectedKind =
        dto.type === BusinessInvoiceType.Sale
          ? CommercialDocumentKind.DeliveryNote
          : CommercialDocumentKind.ReceiptNote;
      if (
        commercialSource.direction !== expectedDirection ||
        commercialSource.kind !== expectedKind ||
        ![
          CommercialDocumentStatus.Confirmed,
          CommercialDocumentStatus.Converted,
        ].includes(commercialSource.status)
      )
        throw new BadRequestException(
          'Le document commercial ne peut pas être transformé en facture.',
        );
      if (
        commercialSource.businessInvoiceId &&
        commercialSource.businessInvoiceId !== invoiceId
      )
        throw new ConflictException(
          'Ce document commercial possède déjà une facture.',
        );
    }

    const calculation = await this.calculate(organizationId, dto);
    const original =
      dto.kind === BusinessInvoiceKind.CreditNote
        ? await this.validateOriginalInvoice(
            organizationId,
            dossierId,
            dto,
            calculation.header.netPayable,
          )
        : null;
    await this.validateAccounts(organizationId, dossierId, dto, calculation);

    return this.dataSource.transaction(async (manager) => {
      const invoice =
        existing ??
        manager.create(BusinessInvoice, {
          organizationId,
          dossierId,
          status: BusinessInvoiceStatus.Draft,
          kind: dto.kind,
          journalEntryId: null,
          createdByUserId: userId,
          validatedByUserId: null,
          validatedAtUtc: null,
          paidAmount: '0.000',
          creditedAmount: '0.000',
          outstandingAmount: calculation.header.netPayable,
          settlementStatus: InvoiceSettlementStatus.Unpaid,
        });
      Object.assign(invoice, {
        type: dto.type,
        nature: dto.nature,
        kind: dto.kind,
        number: dto.number.trim(),
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate ?? null,
        thirdPartyName: dto.thirdPartyName.trim(),
        thirdPartyTaxIdentifier: dto.thirdPartyTaxIdentifier?.trim() || null,
        thirdPartyId: thirdParty?.id ?? null,
        originalInvoiceId: original?.id ?? null,
        journalId: dto.journalId,
        thirdPartyAccountId: dto.thirdPartyAccountId,
        vatAccountId: dto.vatAccountId ?? null,
        stampAccountId: dto.stampAccountId ?? null,
        withholdingAccountId: dto.withholdingAccountId ?? null,
        sourceDocumentId: dto.sourceDocumentId ?? null,
        sourceCommercialDocumentId: dto.sourceCommercialDocumentId ?? null,
        notes: dto.notes?.trim() || null,
        ...calculation.header,
      });
      const saved = await manager.save(invoice);
      if (existing)
        await manager.delete(BusinessInvoiceLine, { invoiceId: saved.id });
      await manager.save(
        calculation.lines.map((line) =>
          manager.create(BusinessInvoiceLine, {
            organizationId,
            invoiceId: saved.id,
            ...line,
          }),
        ),
      );
      if (commercialSource) {
        commercialSource.status = CommercialDocumentStatus.Converted;
        commercialSource.businessInvoiceId = saved.id;
        await manager.save(commercialSource);
      }
      return manager.findOneOrFail(BusinessInvoice, {
        where: { id: saved.id },
        relations: {
          journal: true,
          thirdParty: true,
          thirdPartyAccount: true,
          lines: { account: true },
        },
      });
    });
  }

  async validate(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const invoice = await this.find(organizationId, dossierId, invoiceId);
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      invoice.invoiceDate,
    );
    if (invoice.status !== BusinessInvoiceStatus.Draft)
      throw new ConflictException('La facture n’est plus en brouillon.');
    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: invoice.journalId,
          entryDate: invoice.invoiceDate,
          pieceReference: invoice.number,
          description:
            `${invoice.kind === BusinessInvoiceKind.CreditNote ? 'Avoir' : invoice.type === BusinessInvoiceType.Purchase ? 'Achat' : 'Vente'} ${invoice.number} - ${invoice.thirdPartyName}`.slice(
              0,
              300,
            ),
          status: JournalEntryStatus.Draft,
          totalDebit: invoice.grossAmount,
          totalCredit: invoice.grossAmount,
          sourceDocumentId: invoice.sourceDocumentId,
          createdByUserId: userId,
          postedByUserId: null,
          postedAtUtc: null,
          reversalEntryId: null,
        }),
      );
      const lines = this.accountingLines(invoice).map((line) =>
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: entry.id,
          ...line,
        }),
      );
      await manager.save(lines);
      invoice.status = BusinessInvoiceStatus.Validated;
      invoice.journalEntryId = entry.id;
      invoice.validatedByUserId = userId;
      invoice.validatedAtUtc = new Date();
      await manager.save(invoice);
      return manager.findOneOrFail(BusinessInvoice, {
        where: { id: invoice.id },
        relations: {
          journal: true,
          thirdParty: true,
          thirdPartyAccount: true,
          lines: { account: true },
        },
      });
    });
  }

  async post(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const invoice = await this.find(organizationId, dossierId, invoiceId);
    if (
      invoice.status !== BusinessInvoiceStatus.Validated ||
      !invoice.journalEntryId
    )
      throw new ConflictException(
        'Validez la facture avant sa comptabilisation.',
      );
    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.findOneBy(JournalEntry, {
        id: invoice.journalEntryId!,
        organizationId,
        dossierId,
      });
      if (!entry || entry.status !== JournalEntryStatus.Draft)
        throw new ConflictException(
          'L’écriture associée ne peut plus être comptabilisée.',
        );
      await this.periodLocks.assertDateOpen(
        organizationId,
        dossierId,
        entry.entryDate,
        manager,
      );
      entry.status = JournalEntryStatus.Posted;
      entry.postedByUserId = userId;
      entry.postedAtUtc = new Date();
      await manager.save(entry);
      invoice.status = BusinessInvoiceStatus.Posted;
      if (
        invoice.kind === BusinessInvoiceKind.CreditNote &&
        invoice.originalInvoiceId
      ) {
        const original = await manager.findOneByOrFail(BusinessInvoice, {
          id: invoice.originalInvoiceId,
          organizationId,
          dossierId,
        });
        const outstanding = toMillimes(original.outstandingAmount);
        const credit = toMillimes(invoice.netPayable);
        if (credit > outstanding)
          throw new ConflictException(
            'Le montant de l’avoir dépasse le solde actuel de la facture.',
          );
        original.creditedAmount = fromMillimes(
          toMillimes(original.creditedAmount) + credit,
        );
        original.outstandingAmount = fromMillimes(outstanding - credit);
        original.settlementStatus = this.settlementStatus(outstanding - credit);
        await manager.save(original);
        invoice.outstandingAmount = '0.000';
        invoice.settlementStatus = InvoiceSettlementStatus.Paid;
      }
      await manager.save(invoice);
      return manager.findOneOrFail(BusinessInvoice, {
        where: { id: invoice.id },
        relations: {
          journal: true,
          thirdParty: true,
          thirdPartyAccount: true,
          lines: { account: true },
        },
      });
    });
  }

  private async calculate(organizationId: string, dto: SaveBusinessInvoiceDto) {
    let totalNet = 0n;
    let totalVat = 0n;
    const taxLines: Record<string, unknown>[] = [];
    const lines = await Promise.all(
      dto.lines.map(async (line) => {
        const quantity = toMillimes(line.quantity, 'Quantité');
        const unitPrice = toMillimes(line.unitPrice, 'Prix unitaire');
        const beforeDiscount = (quantity * unitPrice + 500n) / 1000n;
        const discount = multiplyRate(
          beforeDiscount,
          line.discountRate ?? '0.00000',
        );
        const net = beforeDiscount - discount;
        let vatRate = line.vatRate ?? '0.00000';
        let vatSource: Record<string, unknown> = {
          source: line.vatRate ? 'SAISIE_MANUELLE' : 'EXONEREE_OU_HORS_CHAMP',
        };
        if (!line.vatRate && line.vatCode) {
          const setting = await this.fiscalSettings.resolveVatRate(
            organizationId,
            line.vatCode,
            dto.invoiceDate,
          );
          vatRate = setting.rate;
          vatSource = {
            code: setting.code,
            rate: setting.rate,
            effectiveFrom: setting.effectiveFrom,
            effectiveTo: setting.effectiveTo,
            sourceLabel: setting.sourceLabel,
            sourceUrl: setting.sourceUrl,
          };
        }
        const vat = multiplyRate(net, vatRate);
        totalNet += net;
        totalVat += vat;
        taxLines.push({
          description: line.description,
          vatCode: line.vatCode ?? null,
          vatRate,
          ...vatSource,
        });
        return {
          accountId: line.accountId,
          description: line.description.trim(),
          quantity: fromMillimes(quantity),
          unitPrice: fromMillimes(unitPrice),
          discountRate: line.discountRate ?? '0.00000',
          vatCode: line.vatCode?.trim().toUpperCase() || null,
          vatRate,
          netAmount: fromMillimes(net),
          vatAmount: fromMillimes(vat),
          grossAmount: fromMillimes(net + vat),
        };
      }),
    );

    const stampSetting = dto.stampDuty
      ? null
      : await this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.StampDuty,
          dto.invoiceDate,
        );
    const stampDuty = toMillimes(
      this.moneyValue(dto.stampDuty ?? stampSetting!.value),
      'Droit de timbre',
    );
    const gross = totalNet + totalVat + stampDuty;
    let withholdingRate: string | null = null;
    let withholdingAmount = 0n;
    let withholdingSnapshot: Record<string, unknown> | null = null;
    const withholdingBase = dto.withholdingBase
      ? toMillimes(dto.withholdingBase, 'Base de retenue')
      : dto.withholdingNature
        ? totalNet
        : 0n;
    if (dto.withholdingNature) {
      const setting = await this.fiscalSettings.resolveWithholdingRate(
        organizationId,
        dto.withholdingNature,
        dto.invoiceDate,
      );
      withholdingRate = setting.rate;
      withholdingAmount = multiplyRate(withholdingBase, setting.rate);
      withholdingSnapshot = {
        natureCode: setting.natureCode,
        rate: setting.rate,
        effectiveFrom: setting.effectiveFrom,
        effectiveTo: setting.effectiveTo,
        sourceLabel: setting.sourceLabel,
        sourceUrl: setting.sourceUrl,
      };
    }
    if (withholdingAmount > gross)
      throw new BadRequestException(
        'La retenue ne peut pas dépasser le total de la facture.',
      );
    return {
      lines,
      header: {
        netAmount: fromMillimes(totalNet),
        vatAmount: fromMillimes(totalVat),
        stampDuty: fromMillimes(stampDuty),
        withholdingBase: fromMillimes(withholdingBase),
        withholdingRate,
        withholdingAmount: fromMillimes(withholdingAmount),
        grossAmount: fromMillimes(gross),
        netPayable: fromMillimes(gross - withholdingAmount),
        taxSnapshot: {
          applicableOn: dto.invoiceDate,
          invoiceNature: dto.nature,
          vatLines: taxLines,
          stampDuty: stampSetting
            ? {
                value: stampSetting.value,
                effectiveFrom: stampSetting.effectiveFrom,
                effectiveTo: stampSetting.effectiveTo,
                sourceLabel: stampSetting.sourceLabel,
                sourceUrl: stampSetting.sourceUrl,
              }
            : { value: dto.stampDuty, source: 'SAISIE_MANUELLE' },
          withholding: withholdingSnapshot,
        },
      },
    };
  }

  private async validateAccounts(
    organizationId: string,
    dossierId: string,
    dto: SaveBusinessInvoiceDto,
    calculation: {
      header: {
        vatAmount: string;
        stampDuty: string;
        withholdingAmount: string;
      };
    },
  ) {
    const ids = [
      dto.thirdPartyAccountId,
      ...dto.lines.map((line) => line.accountId),
      ...(dto.vatAccountId ? [dto.vatAccountId] : []),
      ...(dto.stampAccountId ? [dto.stampAccountId] : []),
      ...(dto.withholdingAccountId ? [dto.withholdingAccountId] : []),
    ];
    const unique = [...new Set(ids)];
    const accounts = await this.accounts.findBy({
      id: In(unique),
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (accounts.length !== unique.length)
      throw new BadRequestException(
        'Un compte comptable est inexistant, inactif ou non mouvementable.',
      );
    if (toMillimes(calculation.header.vatAmount) > 0n && !dto.vatAccountId)
      throw new BadRequestException(
        'Le compte de TVA est obligatoire lorsque la facture contient de la TVA.',
      );
    if (toMillimes(calculation.header.stampDuty) > 0n && !dto.stampAccountId)
      throw new BadRequestException(
        'Le compte de timbre est obligatoire lorsque le timbre est appliqué.',
      );
    if (
      toMillimes(calculation.header.withholdingAmount) > 0n &&
      !dto.withholdingAccountId
    )
      throw new BadRequestException(
        'Le compte de retenue est obligatoire lorsqu’une retenue est calculée.',
      );
  }

  private accountingLines(invoice: BusinessInvoice) {
    const purchase = invoice.type === BusinessInvoiceType.Purchase;
    const lines: Array<{
      accountId: string;
      label: string;
      debit: string;
      credit: string;
      thirdPartyName: string | null;
    }> = invoice.lines.map((line) => ({
      accountId: line.accountId,
      label: line.description,
      debit: purchase ? line.netAmount : '0.000',
      credit: purchase ? '0.000' : line.netAmount,
      thirdPartyName: null,
    }));
    if (toMillimes(invoice.vatAmount) > 0n)
      lines.push({
        accountId: invoice.vatAccountId!,
        label: purchase ? 'TVA déductible' : 'TVA collectée',
        debit: purchase ? invoice.vatAmount : '0.000',
        credit: purchase ? '0.000' : invoice.vatAmount,
        thirdPartyName: null,
      });
    if (toMillimes(invoice.stampDuty) > 0n)
      lines.push({
        accountId: invoice.stampAccountId!,
        label: 'Droit de timbre',
        debit: purchase ? invoice.stampDuty : '0.000',
        credit: purchase ? '0.000' : invoice.stampDuty,
        thirdPartyName: null,
      });
    if (toMillimes(invoice.withholdingAmount) > 0n)
      lines.push({
        accountId: invoice.withholdingAccountId!,
        label: 'Retenue à la source',
        debit: purchase ? '0.000' : invoice.withholdingAmount,
        credit: purchase ? invoice.withholdingAmount : '0.000',
        thirdPartyName: invoice.thirdPartyName,
      });
    lines.push({
      accountId: invoice.thirdPartyAccountId,
      label: invoice.thirdPartyName,
      debit: purchase ? '0.000' : invoice.netPayable,
      credit: purchase ? invoice.netPayable : '0.000',
      thirdPartyName: invoice.thirdPartyName,
    });
    if (invoice.kind === BusinessInvoiceKind.CreditNote) {
      return lines.map((line) => ({
        ...line,
        debit: line.credit,
        credit: line.debit,
      }));
    }
    return lines;
  }

  private async find(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
  ) {
    const invoice = await this.invoices.findOne({
      where: { id: invoiceId, organizationId, dossierId },
      relations: {
        journal: true,
        thirdParty: true,
        thirdPartyAccount: true,
        lines: { account: true },
      },
    });
    if (!invoice) throw new NotFoundException('La facture est introuvable.');
    return invoice;
  }

  private async isClient(organizationId: string, userId: string) {
    const membership = await this.memberships.findOne({
      where: { organizationId, userId, isActive: true },
      relations: { role: true },
    });
    return (
      membership?.role.normalizedName ===
      SystemRoleNames.ClientPortal.toUpperCase()
    );
  }

  private moneyValue(value: string) {
    return value.replace(/(\.\d{3})0{1,2}$/, '$1');
  }

  private async validateOriginalInvoice(
    organizationId: string,
    dossierId: string,
    dto: SaveBusinessInvoiceDto,
    creditAmount: string,
  ) {
    if (!dto.originalInvoiceId)
      throw new BadRequestException(
        'La facture d’origine est obligatoire pour un avoir.',
      );
    const original = await this.invoices.findOneBy({
      id: dto.originalInvoiceId,
      organizationId,
      dossierId,
      type: dto.type,
      kind: BusinessInvoiceKind.Invoice,
      status: BusinessInvoiceStatus.Posted,
    });
    if (!original)
      throw new NotFoundException(
        'La facture d’origine comptabilisée est introuvable.',
      );
    if (toMillimes(creditAmount) > toMillimes(original.outstandingAmount))
      throw new BadRequestException(
        'Le montant de l’avoir dépasse le solde de la facture d’origine.',
      );
    return original;
  }

  private settlementStatus(outstanding: bigint) {
    return outstanding === 0n
      ? InvoiceSettlementStatus.Paid
      : InvoiceSettlementStatus.PartiallyPaid;
  }
}
