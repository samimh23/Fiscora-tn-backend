import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { InvitationMailerService } from './invitation-mailer.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

describe('InvitationMailerService', () => {
  const sentMessages: Array<Record<string, unknown>> = [];
  const emailLogs = { write: jest.fn() };
  const sendMail = jest.fn((message: Record<string, unknown>) => {
    sentMessages.push(message);
    return Promise.resolve({
      messageId: 'message-1',
      response: '250 OK',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sentMessages.length = 0;
    emailLogs.write.mockResolvedValue({ id: 'email-log-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('uses the public application URL for invitation links', () => {
    const service = new InvitationMailerService(
      new ConfigService({ APP_PUBLIC_URL: 'https://app.fiscora.me/' }),
      emailLogs as never,
    );

    expect(service.invitationUrl('a token')).toBe(
      'https://app.fiscora.me/invitation/a%20token',
    );
  });

  it('identifies the inviter, makes their address replyable, and logs delivery', async () => {
    const service = new InvitationMailerService(
      new ConfigService({
        APP_PUBLIC_URL: 'https://app.fiscora.me',
        SMTP_HOST: 'smtp-relay.brevo.com',
        SMTP_FROM: 'Fiscora <invitations@fiscora.me>',
      }),
      emailLogs as never,
    );

    await service.sendInvitation({
      organizationId: '2acbd709-8f3a-4e6e-8087-e337130773ae',
      actorUserId: 'cb49f651-b597-4c62-a0df-e0ddae60fc04',
      recipient: 'client@example.com',
      organizationName: 'Cabinet Sami & Associés',
      inviterName: 'Sami Mahjoub',
      replyTo: 'sami@example.com',
      roleName: 'Client',
      expiresAtUtc: new Date('2026-08-07T12:00:00.000Z'),
      token: 'secure-token',
    });

    const message = sentMessages[0];
    expect(message).toMatchObject({
      from: 'Fiscora <invitations@fiscora.me>',
      replyTo: 'sami@example.com',
      to: 'client@example.com',
      subject:
        'Sami Mahjoub vous invite à rejoindre Cabinet Sami & Associés sur Fiscora',
    });
    expect(String(message.text)).toContain(
      'Sami Mahjoub, de Cabinet Sami & Associés',
    );
    expect(String(message.html)).toContain('Cabinet Sami &amp; Associés');
    expect(emailLogs.write).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: '2acbd709-8f3a-4e6e-8087-e337130773ae',
        actorUserId: 'cb49f651-b597-4c62-a0df-e0ddae60fc04',
        category: 'INVITATION',
        recipient: 'client@example.com',
        status: 'ENVOYE',
        providerMessageId: 'message-1',
        smtpResponse: '250 OK',
      }),
    );
  });
});
