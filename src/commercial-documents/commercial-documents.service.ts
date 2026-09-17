import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { DataSource, In, Repository } from 'typeorm';
import { fromMillimes, multiplyRate, toMillimes } from '../common/money';
import {
  AccountingDocument,
  ClientDossier,
  CommercialDocument,
  CommercialDocumentDirection,
  CommercialDocumentKind,
  CommercialDocumentLine,
  CommercialDocumentStatus,
  DocumentCategory,
  DocumentIngestionSource,
  DocumentProcessingStatus,
  ExtractionStatus,
  LedgerAccount,
  MalwareScanStatus,
  ThirdParty,
  ThirdPartyType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { FiscalSettingsService } from '../fiscal-settings/fiscal-settings.service';
import {
  DOCUMENT_OBJECT_STORAGE,
  type DocumentObjectStorage,
} from '../documents/object-storage/object-storage';
import { ConvertCommercialDocumentDto, SaveCommercialDocumentDto } from './dto';

@Injectable()
export class CommercialDocumentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CommercialDocument)
    private readonly documents: Repository<CommercialDocument>,
    @InjectRepository(ThirdParty)
    private readonly thirdParties: Repository<ThirdParty>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @Inject(DOCUMENT_OBJECT_STORAGE)
    private readonly objectStorage: DocumentObjectStorage,
    private readonly dossiers: DossiersService,
    private readonly fiscalSettings: FiscalSettingsService,
  ) {}

  async list(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.documents.find({
      where: { organizationId, dossierId },
      relations: { thirdParty: true, lines: { account: true } },
      order: { issueDate: 'DESC', createdAtUtc: 'DESC' },
      take: 500,
    });
  }

  async get(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.find(organizationId, dossierId, documentId);
  }

  async save(
    organizationId: string,
    dossierId: string,
    documentId: string | null,
    userId: string,
    dto: SaveCommercialDocumentDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    this.assertKindAllowed(dto.direction, dto.kind);
    const existing = documentId
      ? await this.find(organizationId, dossierId, documentId)
      : null;
    if (existing && existing.status !== CommercialDocumentStatus.Draft)
      throw new ConflictException(
        'Seul un document commercial en brouillon peut être modifié.',
      );
    const duplicate = await this.documents
      .createQueryBuilder('document')
      .where('document.dossier_id = :dossierId', { dossierId })
      .andWhere('document.direction = :direction', {
        direction: dto.direction,
      })
      .andWhere('document.kind = :kind', { kind: dto.kind })
      .andWhere('UPPER(document.number) = UPPER(:number)', {
        number: dto.number.trim(),
      })
      .andWhere(documentId ? 'document.id != :documentId' : '1=1', {
        documentId,
      })
      .getExists();
    if (duplicate)
      throw new ConflictException(
        'Un document du même type porte déjà ce numéro.',
      );

    const thirdParty = await this.thirdParties.findOneBy({
      id: dto.thirdPartyId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!thirdParty)
      throw new NotFoundException('Le client ou fournisseur est introuvable.');
    this.assertThirdParty(dto.direction, thirdParty);
    await this.validateAccounts(organizationId, dossierId, dto);
    const calculation = await this.calculate(organizationId, dto);

    return this.dataSource.transaction(async (manager) => {
      const document =
        existing ??
        manager.create(CommercialDocument, {
          organizationId,
          dossierId,
          status: CommercialDocumentStatus.Draft,
          sourceDocumentId: null,
          convertedToDocumentId: null,
          businessInvoiceId: null,
          createdByUserId: userId,
          confirmedByUserId: null,
          confirmedAtUtc: null,
        });
      Object.assign(document, {
        direction: dto.direction,
        kind: dto.kind,
        number: dto.number.trim(),
        issueDate: dto.issueDate,
        validUntil: dto.validUntil ?? null,
        thirdPartyId: dto.thirdPartyId,
        currencyCode: dto.currencyCode.toUpperCase(),
        notes: dto.notes?.trim() || null,
        ...calculation.header,
      });
      const saved = await manager.save(document);
      if (existing)
        await manager.delete(CommercialDocumentLine, {
          documentId: saved.id,
        });
      await manager.save(
        calculation.lines.map((line) =>
          manager.create(CommercialDocumentLine, {
            organizationId,
            documentId: saved.id,
            ...line,
          }),
        ),
      );
      return manager.findOneOrFail(CommercialDocument, {
        where: { id: saved.id },
        relations: { thirdParty: true, lines: { account: true } },
      });
    });
  }

  async confirm(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const document = await this.find(organizationId, dossierId, documentId);
    if (document.status !== CommercialDocumentStatus.Draft)
      throw new ConflictException('Ce document n’est plus en brouillon.');
    const confirmedAtUtc = new Date();
    let generated:
      { buffer: Buffer; objectKey: string; originalName: string } | undefined;
    if (
      document.direction === CommercialDocumentDirection.Sale &&
      document.kind === CommercialDocumentKind.Invoice &&
      !document.accountingDocumentId
    ) {
      const buffer = await this.renderInvoicePdf(dossier, document);
      const safeNumber = document.number.replace(/[^a-zA-Z0-9_-]+/g, '-');
      generated = {
        buffer,
        objectKey: `${organizationId}/${dossierId}/generated-sales-invoices/${document.id}.pdf`,
        originalName: `facture-${safeNumber}.pdf`,
      };
      await this.objectStorage.putObject(
        generated.objectKey,
        generated.buffer,
        'application/pdf',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      document.status = CommercialDocumentStatus.Confirmed;
      document.confirmedByUserId = userId;
      document.confirmedAtUtc = confirmedAtUtc;
      if (generated) {
        const [periodYear, periodMonth] = document.issueDate
          .split('-')
          .map(Number);
        const accountingDocument = await manager.save(
          manager.create(AccountingDocument, {
            organizationId,
            dossierId,
            taskId: null,
            obligationId: null,
            originalName: generated.originalName,
            objectKey: generated.objectKey,
            mimeType: 'application/pdf',
            sizeBytes: String(generated.buffer.length),
            category: DocumentCategory.Sales,
            periodYear,
            periodMonth,
            processingStatus: DocumentProcessingStatus.ToProcess,
            extractionStatus: ExtractionStatus.Validated,
            extractedData: this.structuredInvoice(document, dossier),
            malwareScanStatus: MalwareScanStatus.Clean,
            malwareSignature: null,
            malwareScannedAtUtc: confirmedAtUtc,
            version: 1,
            replacesDocumentId: null,
            uploadedByUserId: userId,
            ingestionSource: DocumentIngestionSource.Generated,
            sourceSenderEmail: document.thirdParty.email,
            sourceSenderName: dossier.tradeName ?? dossier.legalName,
            sourceSubject: `Facture de vente ${document.number}`,
            sourceMessageId: `commercial-document:${document.id}`,
            inboundEmailId: null,
            isClientVisible: true,
            deletedAtUtc: null,
          }),
        );
        document.accountingDocumentId = accountingDocument.id;
      }
      return manager.save(document);
    });
  }

  async convert(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
    dto: ConvertCommercialDocumentDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const source = await this.find(organizationId, dossierId, documentId);
    if (source.status !== CommercialDocumentStatus.Confirmed)
      throw new ConflictException(
        'Confirmez le document avant de le convertir.',
      );
    this.assertConversion(source.direction, source.kind, dto.targetKind);
    if (
      await this.documents.existsBy({
        dossierId,
        direction: source.direction,
        kind: dto.targetKind,
        number: dto.number.trim(),
      })
    )
      throw new ConflictException('Un document cible porte déjà ce numéro.');

    return this.dataSource.transaction(async (manager) => {
      const target = await manager.save(
        manager.create(CommercialDocument, {
          organizationId,
          dossierId,
          direction: source.direction,
          kind: dto.targetKind,
          status: CommercialDocumentStatus.Draft,
          number: dto.number.trim(),
          issueDate: dto.issueDate,
          validUntil: dto.validUntil ?? null,
          thirdPartyId: source.thirdPartyId,
          currencyCode: source.currencyCode,
          netAmount: source.netAmount,
          vatAmount: source.vatAmount,
          grossAmount: source.grossAmount,
          sourceDocumentId: source.id,
          convertedToDocumentId: null,
          businessInvoiceId: null,
          notes: source.notes,
          createdByUserId: userId,
          confirmedByUserId: null,
          confirmedAtUtc: null,
        }),
      );
      await manager.save(
        source.lines.map((line) =>
          manager.create(CommercialDocumentLine, {
            organizationId,
            documentId: target.id,
            accountId: line.accountId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountRate: line.discountRate,
            vatCode: line.vatCode,
            vatRate: line.vatRate,
            netAmount: line.netAmount,
            vatAmount: line.vatAmount,
            grossAmount: line.grossAmount,
          }),
        ),
      );
      source.status = CommercialDocumentStatus.Converted;
      source.convertedToDocumentId = target.id;
      await manager.save(source);
      return manager.findOneOrFail(CommercialDocument, {
        where: { id: target.id },
        relations: { thirdParty: true, lines: { account: true } },
      });
    });
  }

  async cancel(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const document = await this.find(organizationId, dossierId, documentId);
    if (
      ![
        CommercialDocumentStatus.Draft,
        CommercialDocumentStatus.Confirmed,
      ].includes(document.status)
    )
      throw new ConflictException('Ce document ne peut plus être annulé.');
    document.status = CommercialDocumentStatus.Cancelled;
    return this.documents.save(document);
  }

  private async calculate(
    organizationId: string,
    dto: SaveCommercialDocumentDto,
  ) {
    let totalNet = 0n;
    let totalVat = 0n;
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
        if (line.vatCode) {
          const setting = await this.fiscalSettings.resolveVatRate(
            organizationId,
            line.vatCode,
            dto.issueDate,
          );
          vatRate = setting.rate;
        }
        const vat = multiplyRate(net, vatRate);
        totalNet += net;
        totalVat += vat;
        return {
          accountId: line.accountId ?? null,
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
    return {
      lines,
      header: {
        netAmount: fromMillimes(totalNet),
        vatAmount: fromMillimes(totalVat),
        grossAmount: fromMillimes(totalNet + totalVat),
      },
    };
  }

  private async validateAccounts(
    organizationId: string,
    dossierId: string,
    dto: SaveCommercialDocumentDto,
  ) {
    const ids = [
      ...new Set(
        dto.lines
          .map((line) => line.accountId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!ids.length) return;
    const count = await this.accounts.countBy({
      id: In(ids),
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (count !== ids.length)
      throw new BadRequestException(
        'Un compte comptable est inexistant, inactif ou non mouvementable.',
      );
  }

  private assertKindAllowed(
    direction: CommercialDocumentDirection,
    kind: CommercialDocumentKind,
  ) {
    const allowed =
      direction === CommercialDocumentDirection.Sale
        ? [
            CommercialDocumentKind.Quote,
            CommercialDocumentKind.Order,
            CommercialDocumentKind.DeliveryNote,
            CommercialDocumentKind.Invoice,
          ]
        : [CommercialDocumentKind.Order, CommercialDocumentKind.ReceiptNote];
    if (!allowed.includes(kind))
      throw new BadRequestException(
        'Ce type de document ne correspond pas au flux choisi.',
      );
  }

  private assertThirdParty(
    direction: CommercialDocumentDirection,
    thirdParty: ThirdParty,
  ) {
    const valid =
      thirdParty.type === ThirdPartyType.Both ||
      (direction === CommercialDocumentDirection.Sale
        ? thirdParty.type === ThirdPartyType.Customer
        : thirdParty.type === ThirdPartyType.Supplier);
    if (!valid)
      throw new BadRequestException(
        'Le type du tiers ne correspond pas au flux commercial.',
      );
  }

  private assertConversion(
    direction: CommercialDocumentDirection,
    source: CommercialDocumentKind,
    target: CommercialDocumentKind,
  ) {
    const expected =
      direction === CommercialDocumentDirection.Sale
        ? source === CommercialDocumentKind.Quote
          ? CommercialDocumentKind.Order
          : source === CommercialDocumentKind.Order
            ? CommercialDocumentKind.DeliveryNote
            : source === CommercialDocumentKind.DeliveryNote
              ? CommercialDocumentKind.Invoice
              : null
        : source === CommercialDocumentKind.Order
          ? CommercialDocumentKind.ReceiptNote
          : null;
    if (target !== expected)
      throw new BadRequestException(
        'La conversion demandée ne respecte pas le cycle commercial.',
      );
  }

  private async find(
    organizationId: string,
    dossierId: string,
    documentId: string,
  ) {
    const document = await this.documents.findOne({
      where: { id: documentId, organizationId, dossierId },
      relations: { thirdParty: true, lines: { account: true } },
    });
    if (!document)
      throw new NotFoundException('Le document commercial est introuvable.');
    return document;
  }

  private structuredInvoice(
    document: CommercialDocument,
    dossier: ClientDossier,
  ) {
    return {
      document_type: 'invoice',
      direction: 'sale',
      document_number: document.number,
      issue_date: document.issueDate,
      currency: document.currencyCode,
      issuer: {
        name: dossier.tradeName ?? dossier.legalName,
        tax_identifier: dossier.taxIdentifier,
      },
      customer: {
        name: document.thirdParty.name,
        tax_identifier: document.thirdParty.taxIdentifier,
        address: document.thirdParty.address,
      },
      subtotal_excl_tax: document.netAmount,
      tax_amount: document.vatAmount,
      total_incl_tax: document.grossAmount,
      amount_due: document.grossAmount,
      line_items: document.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        tax_rate: line.vatRate,
        line_total: line.grossAmount,
      })),
      source: 'client_portal',
    };
  }

  private renderInvoicePdf(
    dossier: ClientDossier,
    invoice: CommercialDocument,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margin: 45 });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      const issuer = dossier.tradeName ?? dossier.legalName;
      pdf.font('Helvetica-Bold').fontSize(20).text(issuer);
      pdf.font('Helvetica').fontSize(9);
      if (dossier.taxIdentifier) pdf.text(`MF : ${dossier.taxIdentifier}`);
      if (dossier.rneNumber) pdf.text(`RNE : ${dossier.rneNumber}`);
      pdf.moveDown(1.5);
      pdf
        .font('Helvetica-Bold')
        .fontSize(18)
        .text('FACTURE', { align: 'right' });
      pdf.font('Helvetica').fontSize(10).text(`N° ${invoice.number}`, {
        align: 'right',
      });
      pdf.text(`Date : ${invoice.issueDate}`, { align: 'right' });
      pdf.moveDown();
      pdf.font('Helvetica-Bold').text('Client');
      pdf.font('Helvetica').text(invoice.thirdParty.name);
      if (invoice.thirdParty.taxIdentifier)
        pdf.text(`MF : ${invoice.thirdParty.taxIdentifier}`);
      if (invoice.thirdParty.address) pdf.text(invoice.thirdParty.address);
      pdf.moveDown(1.5);

      let y = pdf.y;
      const columns = [45, 320, 375, 455, 545];
      pdf.font('Helvetica-Bold').fontSize(9);
      pdf.text('Désignation', columns[0], y, { width: 265 });
      pdf.text('Qté', columns[1], y, { width: 45, align: 'right' });
      pdf.text('P.U.', columns[2], y, { width: 70, align: 'right' });
      pdf.text('TVA', columns[3], y, { width: 55, align: 'right' });
      pdf.text('Total', columns[4] - 55, y, { width: 95, align: 'right' });
      y += 18;
      pdf
        .moveTo(45, y - 4)
        .lineTo(550, y - 4)
        .strokeColor('#999999')
        .stroke();
      pdf.font('Helvetica').fontSize(8.5);
      for (const line of invoice.lines) {
        if (y > 690) {
          pdf.addPage();
          y = 55;
        }
        pdf.text(line.description, columns[0], y, { width: 265 });
        pdf.text(line.quantity, columns[1], y, { width: 45, align: 'right' });
        pdf.text(line.unitPrice, columns[2], y, { width: 70, align: 'right' });
        pdf.text(
          `${(Number(line.vatRate) * 100).toFixed(1)} %`,
          columns[3],
          y,
          {
            width: 55,
            align: 'right',
          },
        );
        pdf.text(line.grossAmount, columns[4] - 55, y, {
          width: 95,
          align: 'right',
        });
        y += 22;
      }
      y += 12;
      pdf.font('Helvetica').fontSize(10);
      pdf.text(
        `Total HT : ${invoice.netAmount} ${invoice.currencyCode}`,
        340,
        y,
        {
          width: 210,
          align: 'right',
        },
      );
      y += 17;
      pdf.text(`TVA : ${invoice.vatAmount} ${invoice.currencyCode}`, 340, y, {
        width: 210,
        align: 'right',
      });
      y += 18;
      pdf
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(
          `Total TTC : ${invoice.grossAmount} ${invoice.currencyCode}`,
          300,
          y,
          {
            width: 250,
            align: 'right',
          },
        );
      if (invoice.notes) {
        pdf.moveDown(3);
        pdf.font('Helvetica').fontSize(9).text(invoice.notes);
      }
      pdf.end();
    });
  }
}
