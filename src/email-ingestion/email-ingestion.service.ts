import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { In, Repository } from 'typeorm';
import {
  ClientDossier,
  DossierAssignment,
  DossierStatus,
  InboundEmailAttachment,
  InboundEmailAttachmentStatus,
  InboundEmailMessage,
  InboundEmailStatus,
  MalwareScanStatus,
  Organization,
  OrganizationMembership,
} from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import { DocumentsService } from '../documents/documents.service';
import {
  MalwareScannerService,
  MalwareScannerUnavailableError,
} from '../documents/malware-scanner.service';
import {
  DOCUMENT_OBJECT_STORAGE,
  type DocumentObjectStorage,
} from '../documents/object-storage/object-storage';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  BrevoInboundAttachment,
  BrevoInboundItem,
  BrevoInboundPayload,
} from './email-ingestion.types';
import {
  brevoRecipientAddresses,
  isBrevoInlineAttachment,
} from './email-ingestion.helpers';

type RouteResult = {
  organization: Organization | null;
  dossier: ClientDossier | null;
  reason: string;
};

@Injectable()
export class EmailIngestionService {
  private readonly logger = new Logger(EmailIngestionService.name);
  private readonly maxAttachmentBytes: number;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(ClientDossier)
    private readonly dossiersRepository: Repository<ClientDossier>,
    @InjectRepository(InboundEmailMessage)
    private readonly messages: Repository<InboundEmailMessage>,
    @InjectRepository(InboundEmailAttachment)
    private readonly attachments: Repository<InboundEmailAttachment>,
    @InjectRepository(DossierAssignment)
    private readonly assignments: Repository<DossierAssignment>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @Inject(DOCUMENT_OBJECT_STORAGE)
    private readonly objectStorage: DocumentObjectStorage,
    private readonly malwareScanner: MalwareScannerService,
    private readonly documents: DocumentsService,
    private readonly dossiers: DossiersService,
    private readonly notifications: NotificationsService,
  ) {
    this.maxAttachmentBytes = Number(
      config.get('EMAIL_INGESTION_MAX_ATTACHMENT_BYTES', 20 * 1024 * 1024),
    );
  }

  async receiveBrevo(secret: string | undefined, payload: BrevoInboundPayload) {
    this.assertWebhookSecret(secret);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) throw new BadRequestException('Payload Brevo vide.');

    const results = [];
    for (const item of items.slice(0, 20)) {
      results.push(await this.processItem(item));
    }
    return { accepted: results.length, items: results };
  }

  async listUnmatched(organizationId: string) {
    const items = await this.messages.find({
      where: { organizationId, status: InboundEmailStatus.Unmatched },
      relations: { attachments: true },
      order: { receivedAtUtc: 'DESC' },
      take: 100,
    });
    return items.map((item) => this.response(item));
  }

  async classify(
    organizationId: string,
    messageId: string,
    dossierId: string,
    actorUserId: string,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const message = await this.messages.findOne({
      where: { id: messageId, organizationId },
      relations: { attachments: true },
    });
    if (!message) throw new NotFoundException('Cet e-mail est introuvable.');
    if (message.status !== InboundEmailStatus.Unmatched) {
      throw new BadRequestException('Cet e-mail a déjà été classé.');
    }

    message.dossierId = dossierId;
    message.routingReason = 'Classé manuellement par le cabinet.';
    await this.importStoredAttachments(message, dossierId, actorUserId);
    await this.messages.save(message);
    await this.notifyCabinet(message);
    return this.response(message);
  }

  private async processItem(item: BrevoInboundItem) {
    const providerEventId = this.providerEventId(item);
    const duplicate = await this.messages.findOne({
      where: { providerEventId },
      relations: { attachments: true },
    });
    if (duplicate) return this.response(duplicate);

    const senderEmail = this.normalizeEmail(item.From?.Address);
    if (!senderEmail) {
      throw new BadRequestException('Expéditeur absent du message entrant.');
    }
    const recipients = brevoRecipientAddresses(item);
    const route = await this.route(recipients, senderEmail);
    const receivedAtUtc = this.safeDate(item.SentAtDate);
    const incomingAttachments = Array.isArray(item.Attachments)
      ? item.Attachments.slice(0, 30)
      : [];
    const message = await this.messages.save(
      this.messages.create({
        providerEventId,
        providerMessageId: this.slice(item.MessageId, 500),
        organizationId: route.organization?.id ?? null,
        dossierId: route.dossier?.id ?? null,
        senderEmail,
        senderName: this.slice(item.From?.Name, 200),
        subject: this.slice(item.Subject, 500),
        recipientAddresses: recipients,
        receivedAtUtc,
        status: route.organization
          ? InboundEmailStatus.Received
          : InboundEmailStatus.Rejected,
        routingReason: route.reason,
        failureReason: route.organization
          ? null
          : 'Adresse de collecte Fiscora inconnue.',
        attachmentCount: incomingAttachments.length,
        importedCount: 0,
      }),
    );

    if (!route.organization) return this.response(message);

    for (const attachment of incomingAttachments) {
      await this.storeAttachment(message, attachment, item);
    }
    message.attachments = await this.attachments.findBy({
      messageId: message.id,
    });

    if (!message.attachments.length) {
      message.status = InboundEmailStatus.Rejected;
      message.failureReason = 'Aucune pièce jointe exploitable.';
    } else if (route.dossier) {
      await this.importStoredAttachments(message, route.dossier.id, null);
      await this.notifyCabinet(message);
    } else {
      message.status = InboundEmailStatus.Unmatched;
    }
    await this.messages.save(message);
    return this.response(message);
  }

  private async storeAttachment(
    message: InboundEmailMessage,
    metadata: BrevoInboundAttachment,
    item: BrevoInboundItem,
  ) {
    const originalName = this.safeName(metadata.Name || 'piece-jointe');
    const mimeType = this.slice(metadata.ContentType, 150) || '';
    const announcedSize = Number(metadata.ContentLength ?? 0);
    const token = metadata.DownloadToken?.trim();
    const record = this.attachments.create({
      messageId: message.id,
      originalName,
      mimeType,
      sizeBytes: String(Math.max(announcedSize, 0)),
      objectKey: null,
      status: InboundEmailAttachmentStatus.Failed,
      malwareSignature: null,
      failureReason: null,
      documentId: null,
    });

    if (!token || !mimeType) {
      record.status = InboundEmailAttachmentStatus.Unsupported;
      record.failureReason = 'Pièce jointe incomplète dans le webhook Brevo.';
      await this.attachments.save(record);
      return;
    }
    if (isBrevoInlineAttachment(metadata, item)) {
      record.status = InboundEmailAttachmentStatus.Unsupported;
      record.failureReason =
        'Image intégrée au corps de l’e-mail, non importée comme document.';
      await this.attachments.save(record);
      return;
    }
    if (announcedSize > this.maxAttachmentBytes) {
      record.status = InboundEmailAttachmentStatus.Unsupported;
      record.failureReason = 'La pièce jointe dépasse la limite de 20 Mo.';
      await this.attachments.save(record);
      return;
    }

    try {
      const buffer = await this.downloadAttachment(token);
      if (buffer.length > this.maxAttachmentBytes) {
        throw new BadRequestException(
          'La pièce jointe dépasse la taille autorisée.',
        );
      }
      const file = {
        buffer,
        originalname: originalName,
        mimetype: mimeType,
        size: buffer.length,
      };
      this.documents.validateIncomingFile(file);
      const scan = await this.malwareScanner.scan(buffer);
      if (scan.status === 'INFECTED') {
        record.status = InboundEmailAttachmentStatus.Infected;
        record.malwareSignature = scan.signature;
        record.failureReason = 'Pièce jointe bloquée par l’antivirus.';
        await this.attachments.save(record);
        return;
      }

      const objectKey = `${message.organizationId}/email-inbox/${message.id}/${randomUUID()}-${originalName}`;
      await this.objectStorage.putObject(objectKey, buffer, mimeType);
      record.objectKey = objectKey;
      record.sizeBytes = String(buffer.length);
      record.status =
        scan.status === 'CLEAN'
          ? InboundEmailAttachmentStatus.Clean
          : InboundEmailAttachmentStatus.NotScanned;
      await this.attachments.save(record);
    } catch (error) {
      record.status =
        error instanceof BadRequestException
          ? InboundEmailAttachmentStatus.Unsupported
          : InboundEmailAttachmentStatus.Failed;
      record.failureReason = this.errorMessage(error);
      await this.attachments.save(record);
    }
  }

  private async importStoredAttachments(
    message: InboundEmailMessage,
    dossierId: string,
    actorUserId: string | null,
  ) {
    const importable = message.attachments.filter(
      (attachment) =>
        !attachment.documentId &&
        Boolean(attachment.objectKey) &&
        [
          InboundEmailAttachmentStatus.Clean,
          InboundEmailAttachmentStatus.NotScanned,
        ].includes(attachment.status),
    );
    for (const attachment of importable) {
      const document = await this.documents.createFromInboundEmail({
        organizationId: message.organizationId!,
        dossierId,
        inboundEmailId: message.id,
        objectKey: attachment.objectKey!,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
        malwareScanStatus:
          attachment.status === InboundEmailAttachmentStatus.Clean
            ? MalwareScanStatus.Clean
            : MalwareScanStatus.NotScanned,
        receivedAtUtc: message.receivedAtUtc,
        senderEmail: message.senderEmail,
        senderName: message.senderName,
        subject: message.subject,
        providerMessageId: message.providerMessageId,
        actorUserId,
      });
      attachment.documentId = document.id;
      attachment.status = InboundEmailAttachmentStatus.Imported;
      await this.attachments.save(attachment);
    }

    message.dossierId = dossierId;
    message.importedCount = message.attachments.filter(
      (attachment) => attachment.documentId,
    ).length;
    message.status =
      message.importedCount === 0
        ? InboundEmailStatus.Rejected
        : message.importedCount === message.attachmentCount
          ? InboundEmailStatus.Imported
          : InboundEmailStatus.Partial;
    message.failureReason =
      message.importedCount === 0
        ? 'Aucune pièce jointe n’a pu être importée.'
        : null;
  }

  private async route(
    recipients: string[],
    senderEmail: string,
  ): Promise<RouteResult> {
    const domain = this.config
      .get<string>('EMAIL_INGESTION_DOMAIN', 'inbox.fiscora.me')
      .trim()
      .toLowerCase();
    for (const address of recipients) {
      const [local, addressDomain] = address.toLowerCase().split('@');
      if (addressDomain !== domain) continue;
      if (local.startsWith('d-')) {
        const dossier = await this.dossiersRepository.findOne({
          where: {
            emailIngestionKey: local.slice(2),
            status: In([DossierStatus.Active, DossierStatus.Suspended]),
          },
          relations: { organization: true },
        });
        if (dossier) {
          return {
            organization: dossier.organization,
            dossier,
            reason: 'Adresse e-mail propre au dossier.',
          };
        }
      }
      if (local.startsWith('o-')) {
        const organization = await this.organizations.findOneBy({
          emailIngestionKey: local.slice(2),
          isActive: true,
        });
        if (!organization) continue;
        const matches = await this.senderMatches(organization.id, senderEmail);
        if (matches.length === 1) {
          const dossier = await this.dossiersRepository.findOneByOrFail({
            id: matches[0],
            organizationId: organization.id,
          });
          return {
            organization,
            dossier,
            reason: 'Expéditeur reconnu dans un seul dossier.',
          };
        }
        return {
          organization,
          dossier: null,
          reason:
            matches.length > 1
              ? 'Cet expéditeur est lié à plusieurs dossiers.'
              : 'Expéditeur non reconnu dans les contacts clients.',
        };
      }
    }
    return {
      organization: null,
      dossier: null,
      reason: 'Aucune adresse de collecte Fiscora reconnue.',
    };
  }

  private async senderMatches(organizationId: string, senderEmail: string) {
    const rows = await this.dossiersRepository.query<{ id: string }[]>(
      `SELECT DISTINCT d.id
         FROM accounting.client_dossiers d
         JOIN accounting.dossier_contacts c ON c.dossier_id = d.id
        WHERE d.organization_id = $1
          AND d.status <> 'ARCHIVE'
          AND c.is_active = true
          AND lower(c.email) = lower($2)
       UNION
       SELECT DISTINCT d.id
         FROM accounting.client_dossiers d
         JOIN accounting.dossier_assignments da ON da.dossier_id = d.id AND da.is_active = true
         JOIN accounting.organization_memberships om ON om.id = da.membership_id AND om.is_active = true
         JOIN accounting.roles r ON r.id = om.role_id
         JOIN accounting.users u ON u.id = om.user_id
        WHERE d.organization_id = $1
          AND d.status <> 'ARCHIVE'
          AND r.normalized_name = $3
          AND lower(u.email) = lower($2)`,
      [organizationId, senderEmail, SystemRoleNames.ClientPortal.toUpperCase()],
    );
    return rows.map((row) => row.id);
  }

  private async notifyCabinet(message: InboundEmailMessage) {
    if (!message.organizationId || !message.dossierId) return;
    const [assignments, owners] = await Promise.all([
      this.assignments.find({
        where: {
          organizationId: message.organizationId,
          dossierId: message.dossierId,
          isActive: true,
        },
        relations: { membership: { role: true } },
      }),
      this.memberships.find({
        where: {
          organizationId: message.organizationId,
          isActive: true,
          role: { normalizedName: SystemRoleNames.Owner.toUpperCase() },
        },
        relations: { role: true },
      }),
    ]);
    const recipients = new Set<string>();
    assignments.forEach((assignment) => {
      if (
        assignment.membership?.userId &&
        assignment.membership.role?.normalizedName !==
          SystemRoleNames.ClientPortal.toUpperCase()
      ) {
        recipients.add(assignment.membership.userId);
      }
    });
    owners.forEach((owner) => recipients.add(owner.userId));
    for (const recipientUserId of recipients) {
      await this.notifications.createForUser({
        organizationId: message.organizationId,
        recipientUserId,
        type: 'DOCUMENT_RECU_EMAIL',
        title: 'Document reçu par e-mail',
        body: `${message.senderName || message.senderEmail} a envoyé ${message.importedCount} pièce(s) jointe(s).`,
        entityType: 'InboundEmailMessage',
        entityId: message.id,
        deduplicationKey: `inbound-email:${message.id}:${recipientUserId}`,
      });
    }
  }

  private async downloadAttachment(token: string) {
    const apiKey = this.config.get<string>('BREVO_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'La clé API Brevo de réception n’est pas configurée.',
      );
    }
    const response = await fetch(
      `https://api.brevo.com/v3/inbound/attachments/${encodeURIComponent(token)}`,
      { headers: { accept: '*/*', 'api-key': apiKey } },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Brevo refuse le téléchargement (${response.status}).`,
      );
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > this.maxAttachmentBytes) {
      throw new BadRequestException(
        'La pièce jointe dépasse la taille autorisée.',
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private assertWebhookSecret(value: string | undefined) {
    const expected = this.config
      .get<string>('INBOUND_EMAIL_WEBHOOK_SECRET')
      ?.trim();
    if (!expected || expected.length < 32) {
      throw new ServiceUnavailableException(
        'La réception des e-mails n’est pas configurée.',
      );
    }
    const left = Buffer.from(value ?? '');
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new NotFoundException();
    }
  }

  private providerEventId(item: BrevoInboundItem) {
    const uuid = item.Uuid?.find(Boolean)?.trim();
    if (uuid) return uuid.slice(0, 200);
    return createHash('sha256')
      .update(
        [
          item.MessageId,
          item.From?.Address,
          item.SentAtDate,
          item.Subject,
        ].join('|'),
      )
      .digest('hex');
  }

  private response(message: InboundEmailMessage) {
    return {
      id: message.id,
      senderEmail: message.senderEmail,
      senderName: message.senderName,
      subject: message.subject,
      recipients: message.recipientAddresses,
      receivedAtUtc: message.receivedAtUtc,
      status: message.status,
      routingReason: message.routingReason,
      failureReason: message.failureReason,
      dossierId: message.dossierId,
      attachmentCount: message.attachmentCount,
      importedCount: message.importedCount,
      attachments: (message.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        status: attachment.status,
        failureReason: attachment.failureReason,
        documentId: attachment.documentId,
      })),
    };
  }

  private normalizeEmail(value?: string | null) {
    const normalized = value?.trim().toLowerCase();
    return normalized && /^[^\s@]+@[^\s@]+$/.test(normalized)
      ? normalized
      : null;
  }

  private safeDate(value?: string) {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private safeName(value: string) {
    return value
      .replace(/[\\/\0]/g, '_')
      .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
      .trim()
      .slice(0, 300);
  }

  private slice(value: string | null | undefined, length: number) {
    return value?.trim().slice(0, length) || null;
  }

  private errorMessage(error: unknown) {
    if (error instanceof MalwareScannerUnavailableError) {
      return 'Le contrôle antivirus est indisponible.';
    }
    if (error instanceof Error) return error.message.slice(0, 2000);
    this.logger.error('Erreur de réception e-mail inconnue.');
    return 'Erreur de réception e-mail inconnue.';
  }
}
