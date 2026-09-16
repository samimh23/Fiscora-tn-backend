import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { In, IsNull, Repository } from 'typeorm';
import {
  AccountingDocument,
  AuditLog,
  DossierAssignment,
  DocumentCategory,
  DocumentIngestionSource,
  DocumentProcessingStatus,
  DocumentRequestStatus,
  MalwareScanStatus,
  MissingDocumentExpectation,
  OrganizationMembership,
} from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateExpectationDto,
  DocumentQueryDto,
  RejectExpectationDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './dto';
import {
  MalwareScannerService,
  MalwareScannerUnavailableError,
} from './malware-scanner.service';
import { InvitationMailerService } from '../email/invitation-mailer.service';
import {
  DOCUMENT_OBJECT_STORAGE,
  type DocumentObjectStorage,
} from './object-storage/object-storage';

@Injectable()
export class DocumentsService implements OnModuleInit {
  constructor(
    @Inject(DOCUMENT_OBJECT_STORAGE)
    private readonly objectStorage: DocumentObjectStorage,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(MissingDocumentExpectation)
    private readonly expectations: Repository<MissingDocumentExpectation>,
    @InjectRepository(AuditLog)
    private readonly audits: Repository<AuditLog>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(DossierAssignment)
    private readonly assignments: Repository<DossierAssignment>,
    private readonly dossiers: DossiersService,
    private readonly malwareScanner: MalwareScannerService,
    private readonly notifications: NotificationsService,
    private readonly invitationMailer: InvitationMailerService,
  ) {}

  async onModuleInit() {
    try {
      await this.objectStorage.ensureReady();
    } catch {
      // The API still starts if object storage is temporarily unavailable.
    }
  }

  async list(
    organizationId: string,
    dossierId: string,
    userId: string,
    query: DocumentQueryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const client = await this.isClient(organizationId, userId);
    const builder = this.documents
      .createQueryBuilder('document')
      .where('document.organization_id = :organizationId', { organizationId })
      .andWhere('document.dossier_id = :dossierId', { dossierId })
      .andWhere('document.deleted_at_utc IS NULL');
    if (client) {
      builder.andWhere(
        '(document.is_client_visible = true OR document.uploaded_by_user_id = :userId)',
        { userId },
      );
    }
    if (query.category)
      builder.andWhere('document.category = :category', {
        category: query.category,
      });
    if (query.periodYear)
      builder.andWhere('document.period_year = :periodYear', query);
    if (query.periodMonth)
      builder.andWhere('document.period_month = :periodMonth', query);
    const items = await builder
      .orderBy('document.created_at_utc', 'DESC')
      .getMany();
    const uploaderIds = [
      ...new Set(
        items
          .map((item) => item.uploadedByUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const uploaders = uploaderIds.length
      ? await this.memberships.find({
          where: {
            organizationId,
            userId: In(uploaderIds),
            isActive: true,
          },
          relations: { user: true, role: true },
        })
      : [];
    const uploaderByUserId = new Map(
      uploaders.map((membership) => [membership.userId, membership]),
    );
    return items.map((item) =>
      this.toResponse(
        item,
        item.uploadedByUserId
          ? uploaderByUserId.get(item.uploadedByUserId)
          : undefined,
      ),
    );
  }

  async upload(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: UploadDocumentDto,
    file?: Express.Multer.File,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const client = await this.isClient(organizationId, userId);
    if (!file) throw new BadRequestException('Sélectionnez un fichier.');
    this.validateIncomingFile(file);

    let malwareScanStatus = MalwareScanStatus.NotScanned;
    let malwareScannedAtUtc: Date | null = null;
    try {
      const scan = await this.malwareScanner.scan(file.buffer);
      if (scan.status === 'INFECTED') {
        const attemptId = crypto.randomUUID();
        await this.audit(
          organizationId,
          userId,
          'document.security_scan.infected',
          attemptId,
          {
            dossierId,
            name: file.originalname,
            signature: scan.signature,
            stored: false,
          },
        );
        throw new BadRequestException(
          `Le fichier a été bloqué par l’antivirus (${scan.signature}).`,
        );
      }
      if (scan.status === 'CLEAN') {
        malwareScanStatus = MalwareScanStatus.Clean;
        malwareScannedAtUtc = new Date();
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const attemptId = crypto.randomUUID();
      await this.audit(
        organizationId,
        userId,
        'document.security_scan.failed',
        attemptId,
        {
          dossierId,
          name: file.originalname,
          stored: false,
        },
      );
      if (error instanceof MalwareScannerUnavailableError) {
        throw new ServiceUnavailableException(
          'Le contrôle antivirus est indisponible. Le fichier n’a pas été stocké.',
        );
      }
      throw error;
    }

    let version = 1;
    if (dto.replacesDocumentId) {
      const previous = await this.find(
        organizationId,
        dossierId,
        dto.replacesDocumentId,
      );
      this.ensureClientDocumentOwnership(client, previous, userId);
      version = previous.version + 1;
    }
    const expectation = dto.expectationId
      ? await this.findOpenExpectation(
          organizationId,
          dossierId,
          dto.expectationId,
        )
      : null;
    if (expectation) {
      dto.category = expectation.category;
      dto.periodYear = expectation.periodYear;
      dto.periodMonth = expectation.periodMonth;
    }

    const objectKey = `${organizationId}/${dossierId}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${this.safeName(file.originalname)}`;
    try {
      await this.objectStorage.putObject(objectKey, file.buffer, file.mimetype);
    } catch {
      throw new BadRequestException(
        'Le stockage de fichiers est indisponible. Vérifiez MinIO.',
      );
    }
    const item = await this.documents.save(
      this.documents.create({
        organizationId,
        dossierId,
        taskId: dto.taskId ?? null,
        obligationId: dto.obligationId ?? null,
        originalName: file.originalname,
        objectKey,
        mimeType: file.mimetype,
        sizeBytes: String(file.size),
        category: dto.category,
        periodYear: dto.periodYear ?? null,
        periodMonth: dto.periodMonth ?? null,
        processingStatus: DocumentProcessingStatus.ToProcess,
        version,
        replacesDocumentId: dto.replacesDocumentId ?? null,
        uploadedByUserId: userId,
        ingestionSource: DocumentIngestionSource.Upload,
        sourceSenderEmail: null,
        sourceSenderName: null,
        sourceSubject: null,
        sourceMessageId: null,
        inboundEmailId: null,
        isClientVisible: client ? true : (dto.isClientVisible ?? false),
        malwareScanStatus,
        malwareSignature: null,
        malwareScannedAtUtc,
        deletedAtUtc: null,
      }),
    );
    await this.audit(organizationId, userId, 'document.uploaded', item.id, {
      dossierId,
      name: file.originalname,
      version,
      expectationId: expectation?.id ?? null,
    });
    if (expectation) {
      expectation.receivedDocumentId = item.id;
      await this.expectations.save(expectation);
      await this.audit(
        organizationId,
        userId,
        'document_expectation.received',
        expectation.id,
        {
          dossierId,
          documentId: item.id,
          label: expectation.label,
        },
      );
      await this.notifyCabinetDocumentReceived(
        organizationId,
        dossierId,
        expectation,
        item,
        userId,
      );
    }
    if (malwareScanStatus === MalwareScanStatus.Clean) {
      await this.audit(
        organizationId,
        userId,
        'document.security_scan.clean',
        item.id,
        { dossierId, name: file.originalname },
      );
    }
    return this.toResponse(item, undefined, client ? 'CLIENT' : 'CABINET');
  }

  validateIncomingFile(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }) {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/xml',
      'text/xml',
      'text/csv',
    ]);
    if (!allowed.has(file.mimetype))
      throw new BadRequestException('Ce type de fichier n’est pas accepté.');
    this.validateFileContent(file);
  }

  async createFromInboundEmail(input: {
    organizationId: string;
    dossierId: string;
    inboundEmailId: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    malwareScanStatus: MalwareScanStatus;
    receivedAtUtc: Date;
    senderEmail: string;
    senderName: string | null;
    subject: string | null;
    providerMessageId: string | null;
    actorUserId?: string | null;
  }) {
    const item = await this.documents.save(
      this.documents.create({
        organizationId: input.organizationId,
        dossierId: input.dossierId,
        taskId: null,
        obligationId: null,
        originalName: input.originalName,
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        sizeBytes: String(input.sizeBytes),
        category: DocumentCategory.Inbox,
        periodYear: input.receivedAtUtc.getUTCFullYear(),
        periodMonth: input.receivedAtUtc.getUTCMonth() + 1,
        processingStatus: DocumentProcessingStatus.ToProcess,
        version: 1,
        replacesDocumentId: null,
        uploadedByUserId: null,
        ingestionSource: DocumentIngestionSource.Email,
        sourceSenderEmail: input.senderEmail,
        sourceSenderName: input.senderName,
        sourceSubject: input.subject,
        sourceMessageId: input.providerMessageId,
        inboundEmailId: input.inboundEmailId,
        isClientVisible: false,
        malwareScanStatus: input.malwareScanStatus,
        malwareSignature: null,
        malwareScannedAtUtc:
          input.malwareScanStatus === MalwareScanStatus.Clean
            ? new Date()
            : null,
        deletedAtUtc: null,
      }),
    );
    await this.audit(
      input.organizationId,
      input.actorUserId ?? null,
      'document.received_by_email',
      item.id,
      {
        dossierId: input.dossierId,
        inboundEmailId: input.inboundEmailId,
        senderEmail: input.senderEmail,
        subject: input.subject,
        name: input.originalName,
      },
    );
    return item;
  }

  async update(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
    dto: UpdateDocumentDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const item = await this.find(organizationId, dossierId, documentId);
    const client = await this.isClient(organizationId, userId);
    this.ensureClientDocumentOwnership(client, item, userId);
    Object.assign(item, {
      category: dto.category,
      periodYear: dto.periodYear ?? null,
      periodMonth: dto.periodMonth ?? null,
      processingStatus: client ? item.processingStatus : dto.processingStatus,
      extractionStatus: client
        ? item.extractionStatus
        : (dto.extractionStatus ?? item.extractionStatus),
      isClientVisible: client
        ? true
        : (dto.isClientVisible ?? item.isClientVisible),
    });
    await this.documents.save(item);
    return this.toResponse(item);
  }

  async downloadUrl(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const item = await this.find(organizationId, dossierId, documentId);
    this.ensureClientDocumentAccess(
      await this.isClient(organizationId, userId),
      item,
      userId,
    );
    await this.ensureSafeForAccess(item, userId);
    return {
      url: await this.objectStorage.signedReadUrl(item.objectKey, 900),
      expiresInSeconds: 900,
    };
  }

  async preview(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const item = await this.find(organizationId, dossierId, documentId);
    this.ensureClientDocumentAccess(
      await this.isClient(organizationId, userId),
      item,
      userId,
    );
    await this.ensureSafeForAccess(item, userId);
    const common = {
      originalName: item.originalName,
      mimeType: item.mimeType,
    };

    if (item.mimeType === 'application/pdf') {
      return { ...common, kind: 'pdf', url: await this.signedUrl(item) };
    }
    if (item.mimeType.startsWith('image/')) {
      return { ...common, kind: 'image', url: await this.signedUrl(item) };
    }

    const content = await this.readObject(item.objectKey);
    if (
      item.mimeType === 'text/csv' ||
      item.mimeType === 'application/xml' ||
      item.mimeType === 'text/xml'
    ) {
      return {
        ...common,
        kind: 'text',
        content: content.toString('utf8').slice(0, 500_000),
        truncated: content.length > 500_000,
      };
    }

    if (
      item.mimeType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Uint8Array.from(content).buffer);
      return {
        ...common,
        kind: 'spreadsheet',
        sheets: workbook.worksheets.slice(0, 20).map((sheet) => {
          const rows: Array<Array<string | number | boolean | null>> = [];
          sheet.eachRow({ includeEmpty: true }, (row) => {
            if (rows.length >= 250) return;
            const values = Array.isArray(row.values)
              ? row.values.slice(1, 51)
              : [];
            rows.push(values.map((value) => this.cellPreviewValue(value)));
          });
          return {
            name: sheet.name,
            rows,
            truncated: sheet.rowCount > 250 || sheet.columnCount > 50,
          };
        }),
      };
    }

    return {
      ...common,
      kind: 'unsupported',
      message:
        item.mimeType === 'application/vnd.ms-excel'
          ? 'Le format Excel XLS ancien ne peut pas être affiché de façon fiable. Convertissez-le en XLSX pour obtenir un aperçu.'
          : 'Ce format ne peut pas être affiché dans le navigateur.',
    };
  }

  async remove(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const item = await this.find(organizationId, dossierId, documentId);
    this.ensureClientDocumentOwnership(
      await this.isClient(organizationId, userId),
      item,
      userId,
    );
    item.deletedAtUtc = new Date();
    await this.documents.save(item);
    await this.audit(organizationId, userId, 'document.deleted', item.id, {
      dossierId,
    });
    return { deleted: true };
  }

  async listExpectations(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
    month: number,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.expectations.find({
      where: {
        organizationId,
        dossierId,
        periodYear: year,
        periodMonth: month,
      },
      order: { label: 'ASC' },
    });
  }

  async createExpectation(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateExpectationDto,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    await this.ensureCabinetMember(organizationId, userId);
    const item = await this.expectations.save(
      this.expectations.create({
        organizationId,
        dossierId,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        category: dto.category,
        label: dto.label.trim(),
        dueOn: dto.dueOn ?? null,
        message: dto.message?.trim() || null,
        status: DocumentRequestStatus.Requested,
        requestedByUserId: userId,
        requestedAtUtc: new Date(),
        receivedDocumentId: null,
      }),
    );
    await this.audit(
      organizationId,
      userId,
      'document_request.created',
      item.id,
      {
        dossierId,
        label: item.label,
        dueOn: item.dueOn,
      },
    );
    await this.notifyClientDocumentRequested(
      organizationId,
      dossierId,
      dossier.legalName,
      item,
      userId,
    );
    return item;
  }

  async receiveExpectation(
    organizationId: string,
    dossierId: string,
    expectationId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.ensureCabinetMember(organizationId, userId);
    const document = await this.find(organizationId, dossierId, documentId);
    await this.ensureSafeForAccess(document, userId);
    const expectation = await this.findOpenExpectation(
      organizationId,
      dossierId,
      expectationId,
    );
    expectation.receivedDocumentId = documentId;
    expectation.status = DocumentRequestStatus.Received;
    expectation.rejectedAtUtc = null;
    expectation.rejectedByUserId = null;
    expectation.rejectionReason = null;
    return this.expectations.save(expectation);
  }

  async validateExpectation(
    organizationId: string,
    dossierId: string,
    expectationId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.ensureCabinetMember(organizationId, userId);
    const expectation = await this.findExpectation(
      organizationId,
      dossierId,
      expectationId,
    );
    if (!expectation.receivedDocumentId) {
      throw new BadRequestException('Aucun document n’a encore été reçu.');
    }
    expectation.status = DocumentRequestStatus.Validated;
    expectation.validatedByUserId = userId;
    expectation.validatedAtUtc = new Date();
    await this.audit(
      organizationId,
      userId,
      'document_request.validated',
      expectation.id,
      { dossierId, documentId: expectation.receivedDocumentId },
    );
    return this.expectations.save(expectation);
  }

  async rejectExpectation(
    organizationId: string,
    dossierId: string,
    expectationId: string,
    userId: string,
    dto: RejectExpectationDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.ensureCabinetMember(organizationId, userId);
    const expectation = await this.findExpectation(
      organizationId,
      dossierId,
      expectationId,
    );
    expectation.status = DocumentRequestStatus.Rejected;
    expectation.rejectedByUserId = userId;
    expectation.rejectedAtUtc = new Date();
    expectation.rejectionReason = dto.reason.trim();
    expectation.receivedDocumentId = null;
    await this.audit(
      organizationId,
      userId,
      'document_request.rejected',
      expectation.id,
      { dossierId, reason: expectation.rejectionReason },
    );
    await this.notifyClientsForExpectationStatus(
      organizationId,
      dossierId,
      expectation,
      'Pièce à corriger',
      `${expectation.label} doit être redéposée : ${expectation.rejectionReason}`,
      'document-request-rejected',
    );
    return this.expectations.save(expectation);
  }

  async cancelExpectation(
    organizationId: string,
    dossierId: string,
    expectationId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.ensureCabinetMember(organizationId, userId);
    const expectation = await this.findExpectation(
      organizationId,
      dossierId,
      expectationId,
    );
    expectation.status = DocumentRequestStatus.Cancelled;
    expectation.cancelledAtUtc = new Date();
    await this.audit(
      organizationId,
      userId,
      'document_request.cancelled',
      expectation.id,
      { dossierId },
    );
    return this.expectations.save(expectation);
  }

  private find(organizationId: string, dossierId: string, id: string) {
    return this.documents
      .findOneBy({
        id,
        organizationId,
        dossierId,
        deletedAtUtc: IsNull(),
      })
      .then((item) => {
        if (!item) throw new NotFoundException('Le document est introuvable.');
        return item;
      });
  }

  private async findOpenExpectation(
    organizationId: string,
    dossierId: string,
    expectationId: string,
  ) {
    const expectation = await this.expectations.findOneBy({
      id: expectationId,
      organizationId,
      dossierId,
    });
    if (!expectation)
      throw new NotFoundException('La pièce demandée est introuvable.');
    if (expectation.receivedDocumentId) {
      throw new BadRequestException('Cette pièce demandée a déjà été reçue.');
    }
    if (
      [
        DocumentRequestStatus.Validated,
        DocumentRequestStatus.Cancelled,
      ].includes(expectation.status)
    ) {
      throw new BadRequestException(
        'Cette demande de pièce est déjà terminée.',
      );
    }
    return expectation;
  }

  private async findExpectation(
    organizationId: string,
    dossierId: string,
    expectationId: string,
  ) {
    const expectation = await this.expectations.findOneBy({
      id: expectationId,
      organizationId,
      dossierId,
    });
    if (!expectation)
      throw new NotFoundException('La pièce demandée est introuvable.');
    return expectation;
  }

  private toResponse(
    item: AccountingDocument,
    uploader?: OrganizationMembership,
    knownUploaderType?: 'CLIENT' | 'CABINET',
  ) {
    const uploaderType =
      item.ingestionSource === DocumentIngestionSource.Email
        ? 'EMAIL'
        : (knownUploaderType ??
          (uploader
            ? uploader.role.normalizedName ===
              SystemRoleNames.ClientPortal.toUpperCase()
              ? 'CLIENT'
              : 'CABINET'
            : 'UNKNOWN'));
    return {
      id: item.id,
      dossierId: item.dossierId,
      taskId: item.taskId,
      obligationId: item.obligationId,
      originalName: item.originalName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      category: item.category,
      periodYear: item.periodYear,
      periodMonth: item.periodMonth,
      processingStatus: item.processingStatus,
      extractionStatus: item.extractionStatus,
      extractedData: item.extractedData,
      version: item.version,
      replacesDocumentId: item.replacesDocumentId,
      createdAtUtc: item.createdAtUtc,
      isClientVisible: item.isClientVisible,
      malwareScanStatus: item.malwareScanStatus,
      malwareSignature: item.malwareSignature,
      malwareScannedAtUtc: item.malwareScannedAtUtc,
      ingestionSource: item.ingestionSource,
      sourceEmail: item.sourceSenderEmail,
      sourceSubject: item.sourceSubject,
      sourceMessageId: item.sourceMessageId,
      uploadedBy: {
        type: uploaderType,
        name:
          (uploaderType === 'EMAIL'
            ? item.sourceSenderName || item.sourceSenderEmail || 'E-mail'
            : uploader?.user.fullName) ??
          (uploaderType === 'CLIENT'
            ? 'Client'
            : uploaderType === 'CABINET'
              ? 'Cabinet'
              : 'Utilisateur inconnu'),
      },
    };
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

  private ensureClientDocumentAccess(
    client: boolean,
    item: AccountingDocument,
    userId: string,
  ) {
    if (client && !item.isClientVisible && item.uploadedByUserId !== userId) {
      throw new NotFoundException('Le document est introuvable.');
    }
  }

  private ensureClientDocumentOwnership(
    client: boolean,
    item: AccountingDocument,
    userId: string,
  ) {
    if (client && item.uploadedByUserId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que les documents que vous avez déposés.',
      );
    }
  }

  private async ensureCabinetMember(organizationId: string, userId: string) {
    if (await this.isClient(organizationId, userId)) {
      throw new ForbiddenException('Cette action est réservée au cabinet.');
    }
  }

  private async notifyCabinetDocumentReceived(
    organizationId: string,
    dossierId: string,
    expectation: MissingDocumentExpectation,
    document: AccountingDocument,
    uploadedByUserId: string,
  ) {
    const [assignments, owners] = await Promise.all([
      this.assignments.find({
        where: { organizationId, dossierId, isActive: true },
        relations: { membership: { role: true } },
      }),
      this.memberships.find({
        where: {
          organizationId,
          isActive: true,
          role: { normalizedName: SystemRoleNames.Owner.toUpperCase() },
        },
        relations: { role: true },
      }),
    ]);
    const recipientUserIds = new Set<string>();
    for (const assignment of assignments) {
      if (
        assignment.membership?.userId &&
        assignment.membership.userId !== uploadedByUserId &&
        assignment.membership.role?.normalizedName !==
          SystemRoleNames.ClientPortal.toUpperCase()
      ) {
        recipientUserIds.add(assignment.membership.userId);
      }
    }
    for (const owner of owners) {
      if (owner.userId !== uploadedByUserId) recipientUserIds.add(owner.userId);
    }
    for (const recipientUserId of recipientUserIds) {
      await this.notifications.createForUser({
        organizationId,
        recipientUserId,
        type: 'PIECE_CLIENT_RECUE',
        title: 'Pièce client reçue',
        body: `${expectation.label} a été déposée par le client (${document.originalName}).`,
        entityType: 'AccountingDocument',
        entityId: document.id,
        deduplicationKey: `document-request-received:${expectation.id}:${document.id}:${recipientUserId}`,
      });
    }
  }

  private async notifyClientDocumentRequested(
    organizationId: string,
    dossierId: string,
    dossierName: string,
    expectation: MissingDocumentExpectation,
    requestedByUserId: string,
  ) {
    const clients = await this.clientRecipients(organizationId, dossierId);
    const requester = await this.memberships.findOne({
      where: { organizationId, userId: requestedByUserId, isActive: true },
      relations: { user: true, organization: true },
    });
    for (const client of clients) {
      await this.notifications.createForUser({
        organizationId,
        recipientUserId: client.userId,
        type: 'PIECE_CLIENT_DEMANDEE',
        title: 'Nouvelle pièce demandée',
        body: `${expectation.label} est demandée pour ${String(expectation.periodMonth).padStart(2, '0')}/${expectation.periodYear}.`,
        entityType: 'MissingDocumentExpectation',
        entityId: expectation.id,
        deduplicationKey: `document-request-created:${expectation.id}:${client.userId}`,
      });
      try {
        await this.invitationMailer.sendDocumentRequest({
          organizationId,
          actorUserId: requestedByUserId,
          recipient: client.email,
          clientName: client.fullName,
          organizationName: requester?.organization?.name ?? 'Votre cabinet',
          dossierId,
          dossierName,
          requestLabel: expectation.label,
          periodLabel: `${String(expectation.periodMonth).padStart(2, '0')}/${expectation.periodYear}`,
          dueOn: expectation.dueOn,
          message: expectation.message,
          replyTo: requester?.user.email ?? null,
        });
      } catch {
        // The portal notification remains the source of truth if SMTP is unavailable.
      }
    }
  }

  private async notifyClientsForExpectationStatus(
    organizationId: string,
    dossierId: string,
    expectation: MissingDocumentExpectation,
    title: string,
    body: string,
    keyPrefix: string,
  ) {
    const clients = await this.clientRecipients(organizationId, dossierId);
    for (const client of clients) {
      await this.notifications.createForUser({
        organizationId,
        recipientUserId: client.userId,
        type: 'PIECE_CLIENT_STATUT',
        title,
        body,
        entityType: 'MissingDocumentExpectation',
        entityId: expectation.id,
        deduplicationKey: `${keyPrefix}:${expectation.id}:${client.userId}:${Date.now()}`,
      });
    }
  }

  private async clientRecipients(organizationId: string, dossierId: string) {
    const assignments = await this.assignments.find({
      where: { organizationId, dossierId, isActive: true },
      relations: { membership: { role: true, user: true } },
    });
    return assignments
      .filter(
        (assignment) =>
          assignment.membership?.role?.normalizedName ===
          SystemRoleNames.ClientPortal.toUpperCase(),
      )
      .map((assignment) => ({
        userId: assignment.membership.userId,
        fullName: assignment.membership.user.fullName,
        email: assignment.membership.user.email,
      }));
  }

  private safeName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180);
  }

  private validateFileContent(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }) {
    if (!file.buffer.length || file.size <= 0) {
      throw new BadRequestException('Le fichier est vide.');
    }
    if (file.originalname.length > 300) {
      throw new BadRequestException('Le nom du fichier est trop long.');
    }

    const extension = file.originalname
      .slice(file.originalname.lastIndexOf('.'))
      .toLowerCase();
    const extensionsByMime: Record<string, string[]> = {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx',
      ],
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
      'text/csv': ['.csv'],
    };
    if (!extensionsByMime[file.mimetype]?.includes(extension)) {
      throw new BadRequestException(
        'L’extension du fichier ne correspond pas à son type.',
      );
    }

    const content = file.buffer;
    const startsWith = (signature: number[]) =>
      signature.every((byte, index) => content[index] === byte);
    const valid =
      (file.mimetype === 'application/pdf' &&
        content.subarray(0, 5).toString('ascii') === '%PDF-') ||
      (file.mimetype === 'image/jpeg' && startsWith([0xff, 0xd8, 0xff])) ||
      (file.mimetype === 'image/png' &&
        startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      (file.mimetype === 'application/vnd.ms-excel' &&
        startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) ||
      (file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        startsWith([0x50, 0x4b])) ||
      ((file.mimetype === 'application/xml' || file.mimetype === 'text/xml') &&
        content
          .toString('utf8', 0, Math.min(content.length, 500))
          .trimStart()[0] === '<') ||
      (file.mimetype === 'text/csv' && !content.includes(0));
    if (!valid) {
      throw new BadRequestException(
        'Le contenu du fichier ne correspond pas au format annoncé.',
      );
    }
  }

  private async ensureSafeForAccess(
    item: AccountingDocument,
    actorUserId: string,
  ) {
    if (item.malwareScanStatus === MalwareScanStatus.Clean) return;
    if (item.malwareScanStatus === MalwareScanStatus.Infected) {
      throw new ForbiddenException(
        'Ce fichier est bloqué car une menace a été détectée.',
      );
    }

    try {
      const content = await this.readObject(item.objectKey);
      const scan = await this.malwareScanner.scan(content);
      if (scan.status === 'DISABLED') return;

      item.malwareScannedAtUtc = new Date();
      if (scan.status === 'INFECTED') {
        item.malwareScanStatus = MalwareScanStatus.Infected;
        item.malwareSignature = scan.signature;
        await this.documents.save(item);
        try {
          await this.objectStorage.removeObject(item.objectKey);
        } catch {
          // Database status remains the access-control source of truth.
        }
        await this.audit(
          item.organizationId,
          actorUserId,
          'document.security_scan.infected',
          item.id,
          {
            dossierId: item.dossierId,
            name: item.originalName,
            signature: scan.signature,
            stored: false,
          },
        );
        throw new ForbiddenException(
          'Ce fichier est bloqué car une menace a été détectée.',
        );
      }

      item.malwareScanStatus = MalwareScanStatus.Clean;
      item.malwareSignature = null;
      await this.documents.save(item);
      await this.audit(
        item.organizationId,
        actorUserId,
        'document.security_scan.clean',
        item.id,
        { dossierId: item.dossierId, name: item.originalName },
      );
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      item.malwareScanStatus = MalwareScanStatus.Failed;
      item.malwareScannedAtUtc = new Date();
      await this.documents.save(item);
      await this.audit(
        item.organizationId,
        actorUserId,
        'document.security_scan.failed',
        item.id,
        { dossierId: item.dossierId, name: item.originalName },
      );
      throw new ServiceUnavailableException(
        'Le contrôle antivirus est indisponible. Le document reste bloqué.',
      );
    }
  }

  private signedUrl(item: AccountingDocument) {
    return this.objectStorage.signedReadUrl(item.objectKey, 900);
  }

  private async readObject(objectKey: string) {
    try {
      return await this.objectStorage.readObject(objectKey);
    } catch {
      throw new BadRequestException(
        'Le document ne peut pas être lu depuis le stockage.',
      );
    }
  }

  private cellPreviewValue(value: unknown): string | number | boolean | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'object') {
      const candidate = value as {
        result?: unknown;
        text?: unknown;
        richText?: Array<{ text?: string }>;
      };
      if (candidate.result !== undefined)
        return this.cellPreviewValue(candidate.result);
      if (typeof candidate.text === 'string') return candidate.text;
      if (Array.isArray(candidate.richText))
        return candidate.richText.map((part) => part.text ?? '').join('');
      return JSON.stringify(value);
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol') return value.description ?? '';
    if (typeof value === 'function') return value.name;
    return '';
  }

  private audit(
    organizationId: string,
    actorUserId: string | null,
    action: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    return this.audits.save(
      this.audits.create({
        organizationId,
        actorUserId,
        action,
        entityType: 'AccountingDocument',
        entityId,
        detailsJson,
      }),
    );
  }
}
