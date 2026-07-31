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
  const sendMail = jest.fn((message: Record<string, unknown>) => {
    sentMessages.push(message);
    return Promise.resolve({ messageId: 'message-1' });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sentMessages.length = 0;
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('uses the public application URL for invitation links', () => {
    const service = new InvitationMailerService(
      new ConfigService({ APP_PUBLIC_URL: 'https://app.fiscora.me/' }),
    );

    expect(service.invitationUrl('a token')).toBe(
      'https://app.fiscora.me/invitation/a%20token',
    );
  });

  it('identifies the inviter and makes their address replyable', async () => {
    const service = new InvitationMailerService(
      new ConfigService({
        APP_PUBLIC_URL: 'https://app.fiscora.me',
        SMTP_HOST: 'email-smtp.eu-north-1.amazonaws.com',
        SMTP_FROM: 'Fiscora <invitations@fiscora.me>',
      }),
    );

    await service.sendInvitation({
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
  });
});
