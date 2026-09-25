import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
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
  DocumentProcessingStatus,
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
  VatSuspensionCertificate,
  VatSuspensionStatus,
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
    @InjectRepository(VatSuspensionCertificate)
    private readonly vatSuspensionCertificates: Repository<VatSuspensionCertificate>,
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
    const duplicateSource = dto.sourceDocumentId
      ? await this.invoices.findOneBy({
          organizationId,
          dossierId,
          sourceDocumentId: dto.sourceDocumentId,
        })
      : null;
    if (duplicateSource && duplicateSource.id !== invoiceId)
      throw new ConflictException(
        'Ce document source possède déjà une facture.',
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
    const sourceDocument = dto.sourceDocumentId
      ? await this.documents.findOneBy({
          id: dto.sourceDocumentId,
          organizationId,
          dossierId,
          deletedAtUtc: IsNull(),
        })
      : null;
    if (dto.sourceDocumentId && !sourceDocument)
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

    let vatSuspensionCertificate: VatSuspensionCertificate | null = null;
    if (dto.vatSuspensionCertificateId) {
      if (dto.type !== BusinessInvoiceType.Purchase)
        throw new BadRequestException(
          'L’attestation de suspension de TVA ne s’applique qu’aux factures d’achat.',
        );
      vatSuspensionCertificate = await this.vatSuspensionCertificates.findOneBy(
        {
          id: dto.vatSuspensionCertificateId,
          organizationId,
          dossierId,
        },
      );
      if (!vatSuspensionCertificate)
        throw new NotFoundException(
          'L’attestation de suspension de TVA est introuvable.',
        );
    }

    const calculation = await this.calculate(organizationId, dto);
    if (vatSuspensionCertificate) {
      if (
        vatSuspensionCertificate.status !== VatSuspensionStatus.Active ||
        dto.invoiceDate < vatSuspensionCertificate.validFrom ||
        dto.invoiceDate > vatSuspensionCertificate.validTo
      )
        throw new ConflictException(
          'L’attestation de suspension n’est pas valide à cette date.',
        );
      if (toMillimes(calculation.header.vatAmount) > 0n)
        throw new BadRequestException(
          'La TVA doit être nulle sur une facture couverte par une attestation de suspension.',
        );
      const remaining =
        toMillimes(vatSuspensionCertificate.authorizedBase) -
        toMillimes(vatSuspensionCertificate.usedBase);
      if (toMillimes(calculation.header.netAmount) > remaining)
        throw new ConflictException(
          'Le plafond restant de l’attestation est insuffisant.',
        );
    }
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
        exciseAccountId: dto.exciseAccountId ?? null,
        withholdingAccountId: dto.withholdingAccountId ?? null,
        vatSuspensionCertificateId: vatSuspensionCertificate?.id ?? null,
        sourceDocumentId: dto.sourceDocumentId ?? null,
        sourceCommercialDocumentId: dto.sourceCommercialDocumentId ?? null,
        notes: dto.notes?.trim() || null,
        ...calculation.header,
      });
      // Editing a draft changes the invoice total, so the amount still owed
      // has to follow it. outstandingAmount is only seeded on creation above
      // and is not part of calculation.header, so without this an edited draft
      // keeps the balance computed from its original lines.
      if (existing)
        invoice.outstandingAmount = fromMillimes(
          toMillimes(calculation.header.netPayable) -
            toMillimes(invoice.paidAmount) -
            toMillimes(invoice.creditedAmount),
        );
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
      if (sourceDocument) {
        sourceDocument.processingStatus = DocumentProcessingStatus.Processed;
        await manager.save(sourceDocument);
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
      if (invoice.vatSuspensionCertificateId) {
        const certificate = await manager.findOneOrFail(
          VatSuspensionCertificate,
          {
            where: {
              id: invoice.vatSuspensionCertificateId,
              organizationId,
              dossierId,
            },
            lock: { mode: 'pessimistic_write' },
          },
        );
        if (
          certificate.status !== VatSuspensionStatus.Active ||
          invoice.invoiceDate < certificate.validFrom ||
          invoice.invoiceDate > certificate.validTo
        )
          throw new ConflictException(
            'L’attestation de suspension n’est plus valide à la date de la facture.',
          );
        const remaining =
          toMillimes(certificate.authorizedBase) -
          toMillimes(certificate.usedBase);
        if (toMillimes(invoice.netAmount) > remaining)
          throw new ConflictException(
            'Le plafond restant de l’attestation est insuffisant.',
          );
        const used =
          toMillimes(certificate.usedBase) + toMillimes(invoice.netAmount);
        certificate.usedBase = fromMillimes(used);
        if (used === toMillimes(certificate.authorizedBase))
          certificate.status = VatSuspensionStatus.Exhausted;
        await manager.save(certificate);
      }
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

  async remove(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const invoice = await this.find(organizationId, dossierId, invoiceId);
    if (
      ![BusinessInvoiceStatus.Draft, BusinessInvoiceStatus.Validated].includes(
        invoice.status,
      )
    )
      throw new ConflictException(
        'Seule une facture en brouillon ou validée peut être supprimée. Une facture comptabilisée doit être corrigée par une écriture d’annulation.',
      );
    if (invoice.status === BusinessInvoiceStatus.Validated)
      await this.periodLocks.assertDateOpen(
        organizationId,
        dossierId,
        invoice.invoiceDate,
      );

    await this.dataSource.transaction(async (manager) => {
      let journalEntry: JournalEntry | null = null;
      if (invoice.status === BusinessInvoiceStatus.Validated) {
        journalEntry = invoice.journalEntryId
          ? await manager.findOneBy(JournalEntry, {
              id: invoice.journalEntryId,
              organizationId,
              dossierId,
            })
          : null;
        if (!journalEntry || journalEntry.status !== JournalEntryStatus.Draft)
          throw new ConflictException(
            'L’écriture liée à cette facture ne peut plus être supprimée.',
          );

        if (invoice.vatSuspensionCertificateId) {
          const certificate = await manager.findOneOrFail(
            VatSuspensionCertificate,
            {
              where: {
                id: invoice.vatSuspensionCertificateId,
                organizationId,
                dossierId,
              },
              lock: { mode: 'pessimistic_write' },
            },
          );
          const releasedBase =
            toMillimes(certificate.usedBase) - toMillimes(invoice.netAmount);
          certificate.usedBase = fromMillimes(
            releasedBase > 0n ? releasedBase : 0n,
          );
          if (certificate.status === VatSuspensionStatus.Exhausted)
            certificate.status = VatSuspensionStatus.Active;
          await manager.save(certificate);
        }
      }

      if (invoice.sourceCommercialDocumentId) {
        const source = await manager.findOne(CommercialDocument, {
          where: {
            id: invoice.sourceCommercialDocumentId,
            organizationId,
            dossierId,
          },
        });
        if (source?.businessInvoiceId === invoice.id) {
          source.businessInvoiceId = null;
          source.status = CommercialDocumentStatus.Confirmed;
          await manager.save(source);
        }
      }

      if (invoice.sourceDocumentId) {
        const source = await manager.findOne(AccountingDocument, {
          where: {
            id: invoice.sourceDocumentId,
            organizationId,
            dossierId,
            deletedAtUtc: IsNull(),
          },
        });
        if (source) {
          source.processingStatus = DocumentProcessingStatus.ToProcess;
          await manager.save(source);
        }
      }

      await manager.delete(BusinessInvoice, { id: invoice.id });
      if (journalEntry)
        await manager.delete(JournalEntry, { id: journalEntry.id });
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
    const currencyCode = dto.currencyCode?.trim().toUpperCase() || 'TND';
    if (currencyCode !== 'TND' && !dto.exchangeRate)
      throw new BadRequestException(
        'Le taux de change est obligatoire pour une facture en devise étrangère.',
      );
    const exchangeRate = currencyCode === 'TND' ? '1.00000' : dto.exchangeRate!;
    let totalNet = 0n;
    let totalVat = 0n;
    let totalExcise = 0n;
    let foreignGross = 0n;
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
        const exciseRate = line.exciseRate ?? null;
        const excise = exciseRate ? multiplyRate(net, exciseRate) : 0n;
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
        // Le droit de consommation est inclus dans la base de la TVA.
        const vat = multiplyRate(net + excise, vatRate);
        foreignGross += net + excise + vat;
        // Les montants sont convertis en TND ; la devise et le taux
        // saisis restent la référence pour retrouver le montant d’origine.
        const netTnd = multiplyRate(net, exchangeRate);
        const exciseTnd = multiplyRate(excise, exchangeRate);
        const vatTnd = multiplyRate(vat, exchangeRate);
        totalNet += netTnd;
        totalVat += vatTnd;
        totalExcise += exciseTnd;
        taxLines.push({
          description: line.description,
          vatCode: line.vatCode ?? null,
          vatRate,
          exciseRate,
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
          exciseRate,
          exciseAmount: fromMillimes(exciseTnd),
          netAmount: fromMillimes(netTnd),
          vatAmount: fromMillimes(vatTnd),
          grossAmount: fromMillimes(netTnd + exciseTnd + vatTnd),
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
    const gross = totalNet + totalExcise + totalVat + stampDuty;
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
        currencyCode,
        exchangeRate,
        foreignGrossAmount:
          currencyCode === 'TND' ? null : fromMillimes(foreignGross),
        netAmount: fromMillimes(totalNet),
        exciseAmount: fromMillimes(totalExcise),
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
        exciseAmount: string;
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
      ...(dto.exciseAccountId ? [dto.exciseAccountId] : []),
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
      toMillimes(calculation.header.exciseAmount) > 0n &&
      !dto.exciseAccountId
    )
      throw new BadRequestException(
        'Le compte de droit de consommation est obligatoire lorsqu’il est appliqué.',
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
    if (toMillimes(invoice.exciseAmount) > 0n)
      lines.push({
        accountId: invoice.exciseAccountId!,
        label: 'Droit de consommation',
        debit: purchase ? invoice.exciseAmount : '0.000',
        credit: purchase ? '0.000' : invoice.exciseAmount,
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

  async matchReceipt(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const invoice = await this.find(organizationId, dossierId, invoiceId);
    if (!invoice.sourceCommercialDocumentId)
      throw new BadRequestException(
        'Cette facture n’est pas rattachée à un bon de réception.',
      );
    const receipt = await this.commercialDocuments.findOne({
      where: {
        id: invoice.sourceCommercialDocumentId,
        organizationId,
        dossierId,
      },
      relations: { lines: { account: true } },
    });
    if (!receipt)
      throw new NotFoundException('Le bon de réception est introuvable.');

    type Aggregate = {
      accountCode: string;
      description: string;
      quantity: bigint;
      netAmount: bigint;
    };
    const aggregate = (
      lines: Array<{
        accountId: string | null;
        account?: { code: string } | null;
        description: string;
        quantity: string;
        netAmount: string;
      }>,
    ) => {
      const map = new Map<string, Aggregate>();
      for (const line of lines) {
        const key = `${line.accountId ?? 'NONE'}::${line.description.trim().toLowerCase()}`;
        const existing = map.get(key);
        const quantity = toMillimes(line.quantity);
        const netAmount = toMillimes(line.netAmount);
        if (existing) {
          existing.quantity += quantity;
          existing.netAmount += netAmount;
        } else {
          map.set(key, {
            accountCode: line.account?.code ?? '',
            description: line.description,
            quantity,
            netAmount,
          });
        }
      }
      return map;
    };
    const receiptLines = aggregate(receipt.lines);
    const invoiceLines = aggregate(invoice.lines);
    const keys = new Set([...receiptLines.keys(), ...invoiceLines.keys()]);
    const quantityTolerance = 1n;
    const rows = [...keys].map((key) => {
      const receiptLine = receiptLines.get(key);
      const invoiceLine = invoiceLines.get(key);
      const receiptQuantity = receiptLine?.quantity ?? 0n;
      const invoiceQuantity = invoiceLine?.quantity ?? 0n;
      const receiptUnitPrice =
        receiptLine && receiptLine.quantity > 0n
          ? (receiptLine.netAmount * 1000n) / receiptLine.quantity
          : 0n;
      const invoiceUnitPrice =
        invoiceLine && invoiceLine.quantity > 0n
          ? (invoiceLine.netAmount * 1000n) / invoiceLine.quantity
          : 0n;
      const priceToleranceBase =
        receiptUnitPrice > invoiceUnitPrice
          ? receiptUnitPrice
          : invoiceUnitPrice;
      const priceDiff =
        receiptUnitPrice > invoiceUnitPrice
          ? receiptUnitPrice - invoiceUnitPrice
          : invoiceUnitPrice - receiptUnitPrice;
      const priceTolerance = (priceToleranceBase * 10n) / 1000n; // 1%
      let status:
        | 'OK'
        | 'ECART_QUANTITE'
        | 'ECART_PRIX'
        | 'ABSENT_FACTURE'
        | 'ABSENT_RECEPTION';
      if (!receiptLine) status = 'ABSENT_RECEPTION';
      else if (!invoiceLine) status = 'ABSENT_FACTURE';
      else if (
        receiptQuantity > invoiceQuantity
          ? receiptQuantity - invoiceQuantity > quantityTolerance
          : invoiceQuantity - receiptQuantity > quantityTolerance
      )
        status = 'ECART_QUANTITE';
      else if (priceDiff > priceTolerance) status = 'ECART_PRIX';
      else status = 'OK';
      return {
        accountCode: (receiptLine ?? invoiceLine)!.accountCode,
        description: (receiptLine ?? invoiceLine)!.description,
        receiptQuantity: fromMillimes(receiptQuantity),
        invoiceQuantity: fromMillimes(invoiceQuantity),
        receiptUnitPrice: fromMillimes(receiptUnitPrice),
        invoiceUnitPrice: fromMillimes(invoiceUnitPrice),
        status,
      };
    });
    return {
      receiptNumber: receipt.number,
      invoiceNumber: invoice.number,
      hasDiscrepancies: rows.some((row) => row.status !== 'OK'),
      lines: rows.sort((a, b) => a.description.localeCompare(b.description)),
    };
  }

  async withholdingCertificatePdf(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const invoice = await this.find(organizationId, dossierId, invoiceId);
    if (invoice.type !== BusinessInvoiceType.Purchase)
      throw new BadRequestException(
        'Le certificat de retenue à la source ne s’applique qu’aux factures d’achat.',
      );
    if (toMillimes(invoice.withholdingAmount) <= 0n)
      throw new BadRequestException(
        'Cette facture ne comporte pas de retenue à la source.',
      );
    const snapshot =
      (invoice.taxSnapshot?.withholding as {
        natureCode?: string;
        rate?: string;
        sourceLabel?: string;
      } | null) ?? null;

    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      info: {
        Title: `Certificat de retenue à la source - ${invoice.number}`,
        Author: 'Fiscora',
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    document.rect(0, 0, 595, 100).fill('#14532D');
    document
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(19)
      .text('Certificat de retenue à la source', 48, 32)
      .font('Helvetica')
      .fontSize(10)
      .text(
        `Émis conformément à l’article 19 du code de l’IRPP et de l’IS`,
        48,
        64,
      );

    let y = 130;
    const field = (label: string, value: string) => {
      document
        .fillColor('#64748B')
        .font('Helvetica')
        .fontSize(9)
        .text(label, 48, y);
      document
        .fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(value, 48, y + 13);
      y += 40;
    };

    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Débiteur (émetteur de la retenue)', 48, y);
    y += 20;
    field('Raison sociale', dossier.legalName);
    field('Matricule fiscal', dossier.taxIdentifier ?? 'Non renseigné');

    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Bénéficiaire (partie retenue)', 48, y);
    y += 20;
    field('Raison sociale', invoice.thirdPartyName);
    field(
      'Matricule fiscal',
      invoice.thirdPartyTaxIdentifier ?? 'Non renseigné',
    );

    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Détail de la retenue', 48, y);
    y += 20;
    field('Facture de référence', invoice.number);
    field('Date de la facture', invoice.invoiceDate);
    field(
      'Nature de la retenue',
      snapshot?.sourceLabel ?? snapshot?.natureCode ?? 'Non précisée',
    );
    field('Base de la retenue', `${invoice.withholdingBase} TND`);
    field(
      'Taux appliqué',
      invoice.withholdingRate
        ? `${(Number(invoice.withholdingRate) * 100).toFixed(2)} %`
        : 'Non précisé',
    );

    y += 6;
    document.roundedRect(48, y, 499, 50, 6).fillAndStroke('#DCFCE7', '#16A34A');
    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(`Montant retenu : ${invoice.withholdingAmount} TND`, 64, y + 17);
    y += 80;

    document
      .fillColor('#64748B')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Ce certificat est délivré au bénéficiaire pour lui permettre d’imputer la retenue à la source sur son impôt dû, conformément à la législation fiscale tunisienne en vigueur. Généré le ${new Date().toLocaleDateString('fr-TN')}.`,
        48,
        y,
        { width: 499 },
      );

    document.end();
    return done;
  }

  private settlementStatus(outstanding: bigint) {
    return outstanding === 0n
      ? InvoiceSettlementStatus.Paid
      : InvoiceSettlementStatus.PartiallyPaid;
  }
}
