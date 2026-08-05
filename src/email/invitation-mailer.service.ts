import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { EmailDeliveryLogService } from './email-delivery-log.service';

interface InvitationEmailInput {
  organizationId?: string;
  actorUserId?: string;
  recipient: string;
  organizationName: string;
  inviterName: string;
  replyTo?: string;
  roleName: string;
  expiresAtUtc: Date;
  token: string;
}

interface PasswordResetEmailInput {
  recipient: string;
  fullName: string;
  token: string;
  expiresAtUtc: Date;
}

interface DocumentRequestEmailInput {
  organizationId: string;
  actorUserId: string;
  recipient: string;
  clientName: string;
  organizationName: string;
  dossierId: string;
  dossierName: string;
  requestLabel: string;
  periodLabel: string;
  dueOn?: string | null;
  message?: string | null;
  replyTo?: string | null;
}

@Injectable()
export class InvitationMailerService {
  constructor(
    private readonly config: ConfigService,
    private readonly emailLogs: EmailDeliveryLogService,
  ) {}

  invitationUrl(token: string) {
    const publicUrl = this.config
      .get<string>('APP_PUBLIC_URL', 'http://127.0.0.1:5173')
      .replace(/\/$/, '');
    return `${publicUrl}/invitation/${encodeURIComponent(token)}`;
  }

  passwordResetUrl(token: string) {
    const publicUrl = this.config
      .get<string>('APP_PUBLIC_URL', 'http://127.0.0.1:5173')
      .replace(/\/$/, '');
    return `${publicUrl}/reinitialiser-mot-de-passe/${encodeURIComponent(token)}`;
  }

  exposeInvitationLinks() {
    return this.config.get('INVITATION_EXPOSE_LINK', 'false') === 'true';
  }

  createTransport() {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host)
      throw new Error('Le serveur SMTP n\u2019est pas configur\u00e9.');
    const port = Number(this.config.get('SMTP_PORT', 587));
    const secure = this.config.get('SMTP_SECURE', 'false') === 'true';
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password ?? '' } : undefined,
    });
  }

  async sendInvitation(input: InvitationEmailInput) {
    const transport = this.createTransport();
    const url = this.invitationUrl(input.token);
    const expires = input.expiresAtUtc.toLocaleString('fr-TN', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Africa/Tunis',
    });
    const from = this.config.get(
      'SMTP_FROM',
      'Fiscora <invitations@fiscora.local>',
    );
    const subject = `${input.inviterName} vous invite \u00e0 rejoindre ${input.organizationName} sur Fiscora`;
    const message = {
      from,
      replyTo: input.replyTo,
      to: input.recipient,
      subject,
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
    };

    try {
      const result = await transport.sendMail(message);
      await this.emailLogs.write({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        category: 'INVITATION',
        recipient: input.recipient,
        sender: from,
        subject,
        status: 'ENVOYE',
        providerMessageId: result.messageId,
        smtpResponse: result.response,
        metadata: { replyTo: input.replyTo ?? null },
      });
    } catch (error) {
      await this.emailLogs.write({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        category: 'INVITATION',
        recipient: input.recipient,
        sender: from,
        subject,
        status: 'ECHEC',
        errorMessage:
          error instanceof Error ? error.message : 'Erreur SMTP inconnue',
        metadata: { replyTo: input.replyTo ?? null },
      });
      throw error;
    }
    return { url };
  }

  async sendPasswordReset(input: PasswordResetEmailInput) {
    const transport = this.createTransport();
    const url = this.passwordResetUrl(input.token);
    const expires = input.expiresAtUtc.toLocaleString('fr-TN', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Africa/Tunis',
    });
    const from = this.config.get(
      'SMTP_FROM',
      'Fiscora <invitations@fiscora.local>',
    );
    const subject = 'Réinitialisation de votre mot de passe Fiscora';

    try {
      const result = await transport.sendMail({
        from,
        to: input.recipient,
        subject,
        text: [
          `Bonjour ${input.fullName},`,
          `Vous avez demandé à réinitialiser votre mot de passe Fiscora.`,
          `Ce lien expire le ${expires} : ${url}`,
          `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
        ].join('\n\n'),
        html: `
          <div style="background:#f6f3ea;padding:32px;font-family:Arial,sans-serif;color:#173a30">
            <div style="max-width:620px;margin:auto;background:#fffdf8;border:1px solid #ded8c8;border-radius:16px;overflow:hidden">
              <div style="background:#103a2f;color:#fff;padding:24px 30px">
                <div style="font-size:22px;font-weight:700">Fiscora</div>
                <div style="opacity:.72;margin-top:4px">Sécurité du compte</div>
              </div>
              <div style="padding:30px">
                <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 16px">Réinitialisez votre mot de passe</h1>
                <p>Bonjour <strong>${this.escape(input.fullName)}</strong>, vous avez demandé à réinitialiser votre mot de passe Fiscora.</p>
                <p style="margin:28px 0"><a href="${this.escape(url)}" style="background:#145a46;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:700">Choisir un nouveau mot de passe</a></p>
                <p style="color:#66736d;font-size:14px">Ce lien personnel expire le ${this.escape(expires)}.</p>
                <p style="color:#66736d;font-size:14px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
                <p style="color:#66736d;font-size:12px;word-break:break-all">Si le bouton ne fonctionne pas : ${this.escape(url)}</p>
              </div>
            </div>
          </div>`,
      });
      await this.emailLogs.write({
        category: 'SYSTEM',
        recipient: input.recipient,
        sender: from,
        subject,
        status: 'ENVOYE',
        providerMessageId: result.messageId,
        smtpResponse: result.response,
        metadata: { type: 'PASSWORD_RESET' },
      });
      return { url };
    } catch (error) {
      await this.emailLogs.write({
        category: 'SYSTEM',
        recipient: input.recipient,
        sender: from,
        subject,
        status: 'ECHEC',
        errorMessage:
          error instanceof Error ? error.message : 'Erreur SMTP inconnue',
        metadata: { type: 'PASSWORD_RESET' },
      });
      throw error;
    }
  }

  async sendTestEmail(recipient: string, actorUserId: string) {
    const transport = this.createTransport();
    const from = this.config.get('SMTP_FROM', 'Fiscora <invitations@fiscora.me>');
    const subject = 'Test Fiscora — envoi transactionnel';
    try {
      const result = await transport.sendMail({
        from,
        to: recipient,
        subject,
        text: [
          'Ceci est un test d’envoi sécurisé depuis Fiscora.',
          'Si vous recevez ce message, la configuration SMTP fonctionne.',
        ].join('\n\n'),
        html: `
          <div style="background:#f6f3ea;padding:28px;font-family:Arial,sans-serif;color:#173a30">
            <div style="max-width:560px;margin:auto;background:#fffdf8;border:1px solid #ded8c8;border-radius:14px;padding:28px">
              <h1 style="font-family:Georgia,serif;margin:0 0 12px">Test Fiscora réussi</h1>
              <p>Si vous recevez ce message, la configuration SMTP transactionnelle fonctionne correctement.</p>
              <p style="color:#66736d;font-size:13px">Message généré depuis l’administration de la plateforme.</p>
            </div>
          </div>`,
      });
      return this.emailLogs.write({
        actorUserId,
        category: 'ADMIN_TEST',
        recipient,
        sender: from,
        subject,
        status: 'ENVOYE',
        providerMessageId: result.messageId,
        smtpResponse: result.response,
      });
    } catch (error) {
      const log = await this.emailLogs.write({
        actorUserId,
        category: 'ADMIN_TEST',
        recipient,
        sender: from,
        subject,
        status: 'ECHEC',
        errorMessage:
          error instanceof Error ? error.message : 'Erreur SMTP inconnue',
      });
      throw Object.assign(
        new Error(
          error instanceof Error ? error.message : 'Erreur SMTP inconnue',
        ),
        { emailLog: log },
      );
    }
  }

  async sendDocumentRequest(input: DocumentRequestEmailInput) {
    const transport = this.createTransport();
    const publicUrl = this.config
      .get<string>('APP_PUBLIC_URL', 'http://127.0.0.1:5173')
      .replace(/\/$/, '');
    const url = `${publicUrl}/portail/dossiers/${encodeURIComponent(input.dossierId)}?tab=documents`;
    const due = input.dueOn
      ? new Intl.DateTimeFormat('fr-TN', {
          dateStyle: 'long',
          timeZone: 'Africa/Tunis',
        }).format(new Date(`${input.dueOn}T00:00:00`))
      : null;
    const from = this.config.get(
      'SMTP_FROM',
      'Fiscora <invitations@fiscora.me>',
    );
    const subject = `${input.organizationName} demande une pièce pour ${input.dossierName}`;
    try {
      const result = await transport.sendMail({
        from,
        replyTo: input.replyTo ?? undefined,
        to: input.recipient,
        subject,
        text: [
          `Bonjour ${input.clientName},`,
          `${input.organizationName} vous demande de transmettre : ${input.requestLabel}.`,
          `Dossier : ${input.dossierName}`,
          `Période : ${input.periodLabel}`,
          due ? `Échéance : ${due}` : '',
          input.message ? `Message du cabinet : ${input.message}` : '',
          `Déposer la pièce : ${url}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        html: `
          <div style="background:#f6f3ea;padding:32px;font-family:Arial,sans-serif;color:#173a30">
            <div style="max-width:620px;margin:auto;background:#fffdf8;border:1px solid #ded8c8;border-radius:16px;overflow:hidden">
              <div style="background:#103a2f;color:#fff;padding:24px 30px">
                <div style="font-size:22px;font-weight:700">Fiscora</div>
                <div style="opacity:.72;margin-top:4px">Demande de pi&egrave;ce</div>
              </div>
              <div style="padding:30px">
                <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 16px">${this.escape(input.requestLabel)}</h1>
                <p>Bonjour <strong>${this.escape(input.clientName)}</strong>, ${this.escape(input.organizationName)} vous demande de transmettre cette pi&egrave;ce pour le dossier <strong>${this.escape(input.dossierName)}</strong>.</p>
                <p><strong>P&eacute;riode :</strong> ${this.escape(input.periodLabel)}${due ? `<br><strong>&Eacute;ch&eacute;ance :</strong> ${this.escape(due)}` : ''}</p>
                ${
                  input.message
                    ? `<p style="background:#f7f1df;border-radius:10px;padding:14px">${this.escape(input.message)}</p>`
                    : ''
                }
                <p style="margin:28px 0"><a href="${this.escape(url)}" style="background:#145a46;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:700">D&eacute;poser la pi&egrave;ce</a></p>
                <p style="color:#66736d;font-size:12px;word-break:break-all">Si le bouton ne fonctionne pas : ${this.escape(url)}</p>
              </div>
            </div>
          </div>`,
      });
      return this.emailLogs.write({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        category: 'DOCUMENT_REQUEST',
        recipient: input.recipient,
        sender: from,
        subject,
        status: 'ENVOYE',
        providerMessageId: result.messageId,
        smtpResponse: result.response,
        metadata: {
          dossierId: input.dossierId,
          requestLabel: input.requestLabel,
        },
      });
    } catch (error) {
      await this.emailLogs.write({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        category: 'DOCUMENT_REQUEST',
        recipient: input.recipient,
        sender: from,
        subject,
        status: 'ECHEC',
        errorMessage:
          error instanceof Error ? error.message : 'Erreur SMTP inconnue',
        metadata: {
          dossierId: input.dossierId,
          requestLabel: input.requestLabel,
        },
      });
      throw error;
    }
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
