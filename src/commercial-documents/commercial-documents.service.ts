import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { fromMillimes, multiplyRate, toMillimes } from '../common/money';
import {
  CommercialDocument,
  CommercialDocumentDirection,
  CommercialDocumentKind,
  CommercialDocumentLine,
  CommercialDocumentStatus,
  LedgerAccount,
  ThirdParty,
  ThirdPartyType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { FiscalSettingsService } from '../fiscal-settings/fiscal-settings.service';
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
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const document = await this.find(organizationId, dossierId, documentId);
    if (document.status !== CommercialDocumentStatus.Draft)
      throw new ConflictException('Ce document n’est plus en brouillon.');
    document.status = CommercialDocumentStatus.Confirmed;
    document.confirmedByUserId = userId;
    document.confirmedAtUtc = new Date();
    return this.documents.save(document);
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
}
