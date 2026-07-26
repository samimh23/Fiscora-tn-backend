import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AccountingJournal,
  CurrencyExchangeRate,
  ForeignTradeOperation,
  ForeignTradeStatus,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalType,
  LedgerAccount,
  TradeDirection,
  VatSuspensionCertificate,
  VatSuspensionStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { PeriodLockService } from '../period-closing/period-lock.service';
import { convertForeignToTnd, normalizeCurrency } from './currency';
import {
  CreateVatSuspensionCertificateDto,
  SaveExchangeRateDto,
  SaveForeignTradeOperationDto,
  SettleForeignTradeOperationDto,
} from './dto';

@Injectable()
export class ForeignTradeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CurrencyExchangeRate)
    private readonly rates: Repository<CurrencyExchangeRate>,
    @InjectRepository(VatSuspensionCertificate)
    private readonly certificates: Repository<VatSuspensionCertificate>,
    @InjectRepository(ForeignTradeOperation)
    private readonly operations: Repository<ForeignTradeOperation>,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    private readonly dossiers: DossiersService,
    private readonly periodLocks: PeriodLockService,
  ) {}

  listRates(organizationId: string) {
    return this.rates.find({
      where: { organizationId },
      order: { effectiveDate: 'DESC', currencyCode: 'ASC' },
      take: 1000,
    });
  }

  async saveRate(
    organizationId: string,
    userId: string,
    dto: SaveExchangeRateDto,
  ) {
    const currencyCode = normalizeCurrency(dto.currencyCode);
    if (currencyCode === 'TND')
      throw new BadRequestException(
        'Le taux du TND est toujours 1 et ne doit pas Ãªtre saisi.',
      );
    const existing = await this.rates.findOneBy({
      organizationId,
      currencyCode,
      effectiveDate: dto.effectiveDate,
    });
    return this.rates.save(
      Object.assign(
        existing ??
          this.rates.create({ organizationId, createdByUserId: userId }),
        {
          currencyCode,
          effectiveDate: dto.effectiveDate,
          rate: dto.rate,
          sourceLabel: dto.sourceLabel.trim(),
          sourceUrl: dto.sourceUrl?.trim() || null,
        },
      ),
    );
  }

  async listCertificates(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const items = await this.certificates.find({
      where: { organizationId, dossierId },
      order: { validTo: 'DESC' },
    });
    const today = new Date().toISOString().slice(0, 10);
    return items.map((item) => ({
      ...item,
      currentStatus:
        item.status === VatSuspensionStatus.Active && item.validTo < today
          ? VatSuspensionStatus.Expired
          : item.status,
      remainingBase: fromMillimes(
        toMillimes(item.authorizedBase) - toMillimes(item.usedBase),
      ),
    }));
  }

  async createCertificate(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateVatSuspensionCertificateDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (dto.validTo < dto.validFrom)
      throw new BadRequestException(
        'La date de fin doit suivre la date de dÃ©but.',
      );
    return this.certificates.save(
      this.certificates.create({
        organizationId,
        dossierId,
        number: dto.number.trim(),
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        authorizedBase: dto.authorizedBase,
        usedBase: '0.000',
        status: VatSuspensionStatus.Active,
        documentId: dto.documentId ?? null,
        notes: dto.notes?.trim() || null,
        createdByUserId: userId,
      }),
    );
  }

  async listOperations(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.operations.find({
      where: { organizationId, dossierId },
      relations: { journal: true, vatSuspensionCertificate: true },
      order: { operationDate: 'DESC', createdAtUtc: 'DESC' },
    });
  }

  async saveOperation(
    organizationId: string,
    dossierId: string,
    operationId: string | null,
    userId: string,
    dto: SaveForeignTradeOperationDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const existing = operationId
      ? await this.findOperation(organizationId, dossierId, operationId)
      : null;
    if (existing && existing.status !== ForeignTradeStatus.Draft)
      throw new ConflictException(
        'Seule une opÃ©ration en brouillon peut Ãªtre modifiÃ©e.',
      );

    const duplicate = await this.operations
      .createQueryBuilder('operation')
      .where('operation.dossier_id = :dossierId', { dossierId })
      .andWhere('UPPER(operation.reference) = UPPER(:reference)', {
        reference: dto.reference.trim(),
      })
      .andWhere(operationId ? 'operation.id != :operationId' : '1=1', {
        operationId,
      })
      .getExists();
    if (duplicate)
      throw new ConflictException('Cette rÃ©fÃ©rence existe dÃ©jÃ .');

    const currencyCode = normalizeCurrency(dto.currencyCode);
    const exchangeRate = await this.resolveRate(
      organizationId,
      currencyCode,
      dto.operationDate,
      dto.exchangeRate,
    );
    const localAmount = convertForeignToTnd(dto.foreignAmount, exchangeRate);
    const costs = [
      dto.freightAmount,
      dto.insuranceAmount,
      dto.customsDuties,
      dto.otherCosts,
    ].reduce((total, value) => total + toMillimes(value ?? '0.000'), 0n);
    const importVat = toMillimes(dto.importVat ?? '0.000');
    if (
      dto.direction === TradeDirection.Export &&
      (costs > 0n || importVat > 0n)
    )
      throw new BadRequestException(
        'Les frais de débarquement, droits et TVA Ã  l’import ne concernent qu’une importation.',
      );
    if (importVat > 0n && !dto.vatAccountId)
      throw new BadRequestException(
        'Le compte de TVA Ã  l’import est obligatoire.',
      );
    if (
      dto.direction === TradeDirection.Export &&
      dto.vatSuspensionCertificateId
    )
      throw new BadRequestException(
        'L’attestation de suspension doit Ãªtre liÃ©e Ã  une importation.',
      );

    const expectedJournal =
      dto.direction === TradeDirection.Import
        ? JournalType.Purchases
        : JournalType.Sales;
    const journal = await this.journals.findOneBy({
      id: dto.journalId,
      organizationId,
      dossierId,
      type: expectedJournal,
      isActive: true,
    });
    if (!journal)
      throw new BadRequestException(
        `SÃ©lectionnez un journal de ${dto.direction === TradeDirection.Import ? 'achats' : 'ventes'}.`,
      );
    await this.validateAccounts(organizationId, dossierId, [
      dto.tradeAccountId,
      dto.thirdPartyAccountId,
      ...(dto.vatAccountId ? [dto.vatAccountId] : []),
    ]);

    if (dto.vatSuspensionCertificateId) {
      const certificate = await this.certificates.findOneBy({
        id: dto.vatSuspensionCertificateId,
        organizationId,
        dossierId,
      });
      if (!certificate)
        throw new NotFoundException('L’attestation est introuvable.');
      this.assertCertificate(
        certificate,
        dto.operationDate,
        localAmount,
        importVat,
      );
    }

    return this.operations.save(
      Object.assign(
        existing ??
          this.operations.create({
            organizationId,
            dossierId,
            createdByUserId: userId,
            status: ForeignTradeStatus.Draft,
            journalEntryId: null,
            settlementRate: null,
            settledLocalAmount: null,
            exchangeDifference: null,
            settlementEntryId: null,
            postedByUserId: null,
            postedAtUtc: null,
          }),
        {
          direction: dto.direction,
          reference: dto.reference.trim(),
          operationDate: dto.operationDate,
          thirdPartyName: dto.thirdPartyName.trim(),
          countryCode: dto.countryCode.toUpperCase(),
          currencyCode,
          foreignAmount: dto.foreignAmount,
          exchangeRate,
          localAmount,
          freightAmount: dto.freightAmount ?? '0.000',
          insuranceAmount: dto.insuranceAmount ?? '0.000',
          customsDuties: dto.customsDuties ?? '0.000',
          importVat: dto.importVat ?? '0.000',
          otherCosts: dto.otherCosts ?? '0.000',
          landedCost: fromMillimes(toMillimes(localAmount) + costs),
          incoterm: dto.incoterm?.toUpperCase() || null,
          customsDeclarationNumber:
            dto.customsDeclarationNumber?.trim() || null,
          customsDeclarationDate: dto.customsDeclarationDate ?? null,
          vatSuspensionCertificateId: dto.vatSuspensionCertificateId ?? null,
          journalId: dto.journalId,
          tradeAccountId: dto.tradeAccountId,
          thirdPartyAccountId: dto.thirdPartyAccountId,
          vatAccountId: dto.vatAccountId ?? null,
        },
      ),
    );
  }

  async postOperation(
    organizationId: string,
    dossierId: string,
    operationId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const operation = await this.findOperation(
      organizationId,
      dossierId,
      operationId,
    );
    if (operation.status !== ForeignTradeStatus.Draft)
      throw new ConflictException('L’opÃ©ration n’est plus en brouillon.');
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      operation.operationDate,
    );

    return this.dataSource.transaction(async (manager) => {
      const total =
        operation.direction === TradeDirection.Import
          ? toMillimes(operation.landedCost) + toMillimes(operation.importVat)
          : toMillimes(operation.localAmount);
      const entry = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: operation.journalId,
          entryDate: operation.operationDate,
          pieceReference: operation.reference,
          description: `${operation.direction} ${operation.reference} - ${operation.thirdPartyName}`,
          status: JournalEntryStatus.Posted,
          totalDebit: fromMillimes(total),
          totalCredit: fromMillimes(total),
          sourceDocumentId: null,
          createdByUserId: userId,
          postedByUserId: userId,
          postedAtUtc: new Date(),
          reversalEntryId: null,
        }),
      );
      const lines =
        operation.direction === TradeDirection.Import
          ? [
              {
                accountId: operation.tradeAccountId,
                label: `CoÃ»t rendu import ${operation.reference}`,
                debit: operation.landedCost,
                credit: '0.000',
                thirdPartyName: null,
              },
              ...(toMillimes(operation.importVat) > 0n
                ? [
                    {
                      accountId: operation.vatAccountId!,
                      label: 'TVA Ã  l’import',
                      debit: operation.importVat,
                      credit: '0.000',
                      thirdPartyName: null,
                    },
                  ]
                : []),
              {
                accountId: operation.thirdPartyAccountId,
                label: operation.thirdPartyName,
                debit: '0.000',
                credit: fromMillimes(total),
                thirdPartyName: operation.thirdPartyName,
              },
            ]
          : [
              {
                accountId: operation.thirdPartyAccountId,
                label: operation.thirdPartyName,
                debit: operation.localAmount,
                credit: '0.000',
                thirdPartyName: operation.thirdPartyName,
              },
              {
                accountId: operation.tradeAccountId,
                label: `Export ${operation.reference}`,
                debit: '0.000',
                credit: operation.localAmount,
                thirdPartyName: null,
              },
            ];
      await manager.save(
        lines.map((line) =>
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            ...line,
          }),
        ),
      );
      if (operation.vatSuspensionCertificateId) {
        const certificate = await manager.findOneByOrFail(
          VatSuspensionCertificate,
          {
            id: operation.vatSuspensionCertificateId,
            organizationId,
            dossierId,
          },
        );
        this.assertCertificate(
          certificate,
          operation.operationDate,
          operation.localAmount,
          toMillimes(operation.importVat),
        );
        const used =
          toMillimes(certificate.usedBase) + toMillimes(operation.localAmount);
        certificate.usedBase = fromMillimes(used);
        if (used === toMillimes(certificate.authorizedBase))
          certificate.status = VatSuspensionStatus.Exhausted;
        await manager.save(certificate);
      }
      operation.journalEntryId = entry.id;
      operation.status = ForeignTradeStatus.Posted;
      operation.postedByUserId = userId;
      operation.postedAtUtc = new Date();
      return manager.save(operation);
    });
  }

  async settleOperation(
    organizationId: string,
    dossierId: string,
    operationId: string,
    userId: string,
    dto: SettleForeignTradeOperationDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const operation = await this.findOperation(
      organizationId,
      dossierId,
      operationId,
    );
    if (operation.status !== ForeignTradeStatus.Posted)
      throw new ConflictException(
        'Comptabilisez l’opÃ©ration avant de constater l’Ã©cart de change.',
      );
    if (
      operation.direction === TradeDirection.Export &&
      !dto.repatriationBankReference &&
      !dto.repatriationProofDocumentId
    )
      throw new BadRequestException(
        'Pour un export, renseignez la référence bancaire ou liez le relevé justifiant le rapatriement.',
      );
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      dto.settlementDate,
    );
    const journal = await this.journals.findOneBy({
      id: dto.journalId,
      organizationId,
      dossierId,
      type: JournalType.Miscellaneous,
      isActive: true,
    });
    if (!journal)
      throw new BadRequestException(
        'SÃ©lectionnez un journal d’opÃ©rations diverses.',
      );
    await this.validateAccounts(organizationId, dossierId, [
      operation.thirdPartyAccountId,
      dto.fxGainAccountId,
      dto.fxLossAccountId,
    ]);
    const settledLocal = convertForeignToTnd(
      operation.foreignAmount,
      dto.settlementRate,
    );
    const difference =
      toMillimes(settledLocal) - toMillimes(operation.localAmount);

    return this.dataSource.transaction(async (manager) => {
      let entryId: string | null = null;
      if (difference !== 0n) {
        const amount = difference < 0n ? -difference : difference;
        const gain =
          (operation.direction === TradeDirection.Import && difference < 0n) ||
          (operation.direction === TradeDirection.Export && difference > 0n);
        const entry = await manager.save(
          manager.create(JournalEntry, {
            organizationId,
            dossierId,
            journalId: dto.journalId,
            entryDate: dto.settlementDate,
            pieceReference: `EC-${operation.reference}`.slice(0, 100),
            description: `Ã‰cart de change ${operation.reference}`,
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
        const thirdPartyDebit =
          (operation.direction === TradeDirection.Import && difference < 0n) ||
          (operation.direction === TradeDirection.Export && difference > 0n);
        await manager.save([
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: operation.thirdPartyAccountId,
            label: `RÃ©Ã©valuation ${operation.thirdPartyName}`,
            debit: thirdPartyDebit ? fromMillimes(amount) : '0.000',
            credit: thirdPartyDebit ? '0.000' : fromMillimes(amount),
            thirdPartyName: operation.thirdPartyName,
          }),
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: gain ? dto.fxGainAccountId : dto.fxLossAccountId,
            label: gain
              ? 'Gain de change rÃ©alisÃ©'
              : 'Perte de change rÃ©alisÃ©e',
            debit: gain ? '0.000' : fromMillimes(amount),
            credit: gain ? fromMillimes(amount) : '0.000',
            thirdPartyName: null,
          }),
        ]);
        entryId = entry.id;
      }
      operation.settlementRate = dto.settlementRate;
      operation.settledLocalAmount = settledLocal;
      operation.exchangeDifference = fromMillimes(difference);
      operation.settlementEntryId = entryId;
      operation.repatriationDate =
        operation.direction === TradeDirection.Export
          ? (dto.repatriationDate ?? dto.settlementDate)
          : null;
      operation.repatriationBankReference =
        operation.direction === TradeDirection.Export
          ? dto.repatriationBankReference?.trim() || null
          : null;
      operation.repatriationProofDocumentId =
        operation.direction === TradeDirection.Export
          ? (dto.repatriationProofDocumentId ?? null)
          : null;
      operation.status = ForeignTradeStatus.Settled;
      return manager.save(operation);
    });
  }

  private async resolveRate(
    organizationId: string,
    currencyCode: string,
    effectiveDate: string,
    explicit?: string,
  ) {
    if (currencyCode === 'TND') return '1.00000000';
    if (explicit) return explicit;
    const item = await this.rates.findOne({
      where: {
        organizationId,
        currencyCode,
        effectiveDate: LessThanOrEqual(effectiveDate),
      },
      order: { effectiveDate: 'DESC' },
    });
    if (!item)
      throw new BadRequestException(
        `Aucun taux ${currencyCode}/TND n’est disponible Ã  la date de l’opÃ©ration.`,
      );
    return item.rate;
  }

  private async validateAccounts(
    organizationId: string,
    dossierId: string,
    ids: string[],
  ) {
    const unique = [...new Set(ids)];
    const found = await this.accounts.findBy({
      id: In(unique),
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (found.length !== unique.length)
      throw new BadRequestException(
        'Un compte comptable est invalide ou non mouvementable.',
      );
  }

  private assertCertificate(
    certificate: VatSuspensionCertificate,
    operationDate: string,
    localAmount: string,
    importVat: bigint,
  ) {
    if (
      certificate.status !== VatSuspensionStatus.Active ||
      operationDate < certificate.validFrom ||
      operationDate > certificate.validTo
    )
      throw new ConflictException(
        'L’attestation de suspension n’est pas valide Ã  cette date.',
      );
    if (importVat > 0n)
      throw new BadRequestException(
        'La TVA Ã  l’import doit Ãªtre nulle avec une attestation de suspension.',
      );
    const remaining =
      toMillimes(certificate.authorizedBase) - toMillimes(certificate.usedBase);
    if (toMillimes(localAmount) > remaining)
      throw new ConflictException(
        'Le plafond restant de l’attestation est insuffisant.',
      );
  }

  private async findOperation(
    organizationId: string,
    dossierId: string,
    operationId: string,
  ) {
    const operation = await this.operations.findOne({
      where: { id: operationId, organizationId, dossierId },
      relations: { journal: true, vatSuspensionCertificate: true },
    });
    if (!operation)
      throw new NotFoundException('L’opÃ©ration est introuvable.');
    return operation;
  }
}
