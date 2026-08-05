import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type EmailLogCategory =
  | 'INVITATION'
  | 'ADMIN_TEST'
  | 'SYSTEM'
  | 'DOCUMENT_REQUEST';
export type EmailLogStatus = 'ENVOYE' | 'ECHEC';

interface WriteEmailLogInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  category: EmailLogCategory;
  recipient: string;
  sender?: string | null;
  subject: string;
  status: EmailLogStatus;
  providerMessageId?: string | null;
  smtpResponse?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class EmailDeliveryLogService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  providerName() {
    const host = this.config.get<string>('SMTP_HOST', '');
    if (host.toLowerCase().includes('brevo')) return 'Brevo SMTP';
    if (host.toLowerCase().includes('amazonaws')) return 'Amazon SES SMTP';
    return host ? 'SMTP' : 'Non configuré';
  }

  async write(input: WriteEmailLogInput) {
    const [row] = await this.dataSource.query<Record<string, unknown>[]>(
      `
        INSERT INTO "accounting"."email_delivery_logs"
          (
            "organization_id",
            "actor_user_id",
            "category",
            "provider",
            "recipient",
            "sender",
            "subject",
            "status",
            "provider_message_id",
            "smtp_response",
            "error_message",
            "metadata_json"
          )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        RETURNING
          "id",
          "created_at_utc" AS "createdAtUtc",
          "category",
          "provider",
          "recipient",
          "sender",
          "subject",
          "status",
          "provider_message_id" AS "providerMessageId",
          "smtp_response" AS "smtpResponse",
          "error_message" AS "errorMessage"
      `,
      [
        input.organizationId ?? null,
        input.actorUserId ?? null,
        input.category,
        this.providerName(),
        input.recipient,
        input.sender ?? null,
        input.subject,
        input.status,
        input.providerMessageId ?? null,
        input.smtpResponse?.slice(0, 2000) ?? null,
        input.errorMessage?.slice(0, 2000) ?? null,
        JSON.stringify(input.metadata ?? null),
      ],
    );
    return row;
  }
}
