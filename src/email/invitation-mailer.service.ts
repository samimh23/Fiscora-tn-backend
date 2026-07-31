import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

interface InvitationEmailInput {
  recipient: string;
  organizationName: string;
  inviterName: string;
  replyTo?: string;
  roleName: string;
  expiresAtUtc: Date;
  token: string;
}

@Injectable()
export class InvitationMailerService {
  constructor(private readonly config: ConfigService) {}

  invitationUrl(token: string) {
    const publicUrl = this.config
      .get<string>('APP_PUBLIC_URL', 'http://127.0.0.1:5173')
      .replace(/\/$/, '');
    return `${publicUrl}/invitation/${encodeURIComponent(token)}`;
  }

  exposeInvitationLinks() {
    return this.config.get('INVITATION_EXPOSE_LINK', 'false') === 'true';
  }

  async sendInvitation(input: InvitationEmailInput) {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host)
      throw new Error('Le serveur SMTP n\u2019est pas configur\u00e9.');
    const port = Number(this.config.get('SMTP_PORT', 587));
    const secure = this.config.get('SMTP_SECURE', 'false') === 'true';
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password ?? '' } : undefined,
    });
    const url = this.invitationUrl(input.token);
    const expires = input.expiresAtUtc.toLocaleString('fr-TN', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Africa/Tunis',
    });
    await transport.sendMail({
      from: this.config.get('SMTP_FROM', 'Fiscora <invitations@fiscora.local>'),
      replyTo: input.replyTo,
      to: input.recipient,
      subject: `${input.inviterName} vous invite \u00e0 rejoindre ${input.organizationName} sur Fiscora`,
      text: [
        `${input.inviterName}, de ${input.organizationName}, vous invite \u00e0 rejoindre son espace Fiscora.`,
        `R\u00f4le : ${input.roleName}`,
        `Cr\u00e9ez votre acc\u00e8s avant le ${expires} : ${url}`,
        'Ce lien est personnel et utilisable une seule fois.',
        input.replyTo
          ? `Une question ? R\u00e9pondez directement \u00e0 cet e-mail pour contacter ${input.inviterName}.`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      html: `
        <div style="background:#f6f3ea;padding:32px;font-family:Arial,sans-serif;color:#173a30">
          <div style="max-width:620px;margin:auto;background:#fffdf8;border:1px solid #ded8c8;border-radius:16px;overflow:hidden">
            <div style="background:#103a2f;color:#fff;padding:24px 30px">
              <div style="font-size:22px;font-weight:700">Fiscora</div>
              <div style="opacity:.72;margin-top:4px">Invitation s&eacute;curis&eacute;e</div>
            </div>
            <div style="padding:30px">
              <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 16px">Rejoignez ${this.escape(input.organizationName)}</h1>
              <p><strong>${this.escape(input.inviterName)}</strong>, de ${this.escape(input.organizationName)}, vous invite &agrave; rejoindre son espace Fiscora avec le r&ocirc;le <strong>${this.escape(input.roleName)}</strong>.</p>
              <p style="margin:28px 0"><a href="${this.escape(url)}" style="background:#145a46;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:700">Accepter l&rsquo;invitation</a></p>
              <p style="color:#66736d;font-size:14px">Ce lien personnel expire le ${this.escape(expires)} et ne peut &ecirc;tre utilis&eacute; qu&rsquo;une seule fois.</p>
              ${
                input.replyTo
                  ? `<p style="color:#66736d;font-size:14px">Une question ? R&eacute;pondez directement &agrave; cet e-mail pour contacter ${this.escape(input.inviterName)}.</p>`
                  : ''
              }
              <p style="color:#66736d;font-size:12px;word-break:break-all">Si le bouton ne fonctionne pas : ${this.escape(url)}</p>
            </div>
          </div>
        </div>`,
    });
    return { url };
  }

  private escape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
