import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Client } from 'minio';
import { IsNull, Repository } from 'typeorm';
import {
  AccountingDocument,
  AuditLog,
  DocumentProcessingStatus,
  MalwareScanStatus,
  MissingDocumentExpectation,
  OrganizationMembership,
} from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  CreateExpectationDto,
  DocumentQueryDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './dto';
import {
  MalwareScannerService,
  MalwareScannerUnavailableError,
} from './malware-scanner.service';

@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly client: Client;
  private readonly publicClient: Client;
  private readonly bucket: string;

  constructor(
    config: ConfigService,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(MissingDocumentExpectation)
    private readonly expectations: Repository<MissingDocumentExpectation>,
    @InjectRepository(AuditLog)
    private readonly audits: Repository<AuditLog>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    private readonly dossiers: DossiersService,
    private readonly malwareScanner: MalwareScannerService,
  ) {
    this.bucket = config.get('MINIO_BUCKET', 'accounting-documents');
    this.client = new Client({
      endPoint: config.get('MINIO_ENDPOINT', 'localhost'),
      port: Number(config.get('MINIO_PORT', 9000)),
      useSSL: config.get('MINIO_USE_SSL', 'false') === 'true',
      region: config.get('MINIO_REGION', 'us-east-1'),
      accessKey: config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.publicClient = new Client({
      endPoint: config.get(
        'MINIO_PUBLIC_ENDPOINT',
        config.get('MINIO_ENDPOINT', 'localhost'),
      ),
      port: Number(
        config.get('MINIO_PUBLIC_PORT', config.get('MINIO_PORT', 9000)),
      ),
      useSSL:
        config.get(
          'MINIO_PUBLIC_USE_SSL',
          config.get('MINIO_USE_SSL', 'false'),
        ) === 'true',
      region: config.get('MINIO_REGION', 'us-east-1'),
      accessKey: config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async onModuleInit() {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket);
      }
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
    return (
      await builder.orderBy('document.created_at_utc', 'DESC').getMany()
    ).map((item) => this.toResponse(item));
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
    const objectKey = `${organizationId}/${dossierId}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${this.safeName(file.originalname)}`;
    try {
      await this.client.putObject(
        this.bucket,
        objectKey,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );
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
    });
    if (malwareScanStatus === MalwareScanStatus.Clean) {
      await this.audit(
        organizationId,
        userId,
        'document.security_scan.clean',
        item.id,
        { dossierId, name: file.originalname },
      );
    }
    return this.toResponse(item);
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
      url: await this.publicClient.presignedGetObject(
        this.bucket,
        item.objectKey,
        900,
      ),
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
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.ensureCabinetMember(organizationId, userId);
    return this.expectations.save(
      this.expectations.create({
        organizationId,
        dossierId,
        ...dto,
        label: dto.label.trim(),
        receivedDocumentId: null,
      }),
    );
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
    const expectation = await this.expectations.findOneBy({
      id: expectationId,
      organizationId,
      dossierId,
    });
    if (!expectation)
      throw new NotFoundException('Le document attendu est introuvable.');
    expectation.receivedDocumentId = documentId;
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

  private toResponse(item: AccountingDocument) {
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

  private safeName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180);
  }

  private validateFileContent(file: Express.Multer.File) {
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
          await this.client.removeObject(this.bucket, item.objectKey);
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
    return this.publicClient.presignedGetObject(
      this.bucket,
      item.objectKey,
      900,
    );
  }

  private async readObject(objectKey: string) {
    try {
      const stream = await this.client.getObject(this.bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      return Buffer.concat(chunks);
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
    actorUserId: string,
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
