import {
  brevoRecipientAddresses,
  isBrevoInlineAttachment,
} from './email-ingestion.helpers';

describe('Brevo inbound helpers', () => {
  it('accepts both documented mailbox recipients and string recipients', () => {
    expect(
      brevoRecipientAddresses({
        Recipients: [
          ' D-ABC@INBOX.FISCORA.ME ',
          { Address: 'o-def@inbox.fiscora.me' },
        ],
        To: [{ Address: 'd-abc@inbox.fiscora.me' }],
      }),
    ).toEqual(['d-abc@inbox.fiscora.me', 'o-def@inbox.fiscora.me']);
  });

  it('filters malformed recipient values', () => {
    expect(
      brevoRecipientAddresses({
        Recipients: ['not-an-email', { Address: '' }],
      }),
    ).toEqual([]);
  });

  it('detects inline content referenced by HTML or extracted markdown', () => {
    expect(
      isBrevoInlineAttachment(
        { ContentID: '<logo-1>' },
        { RawHtmlBody: '<img src="cid:logo-1">' },
      ),
    ).toBe(true);
    expect(
      isBrevoInlineAttachment(
        { ContentID: 'scan-2' },
        { ExtractedMarkdownMessage: '[scan](scan-2)' },
      ),
    ).toBe(true);
    expect(
      isBrevoInlineAttachment(
        { ContentID: 'attached-pdf' },
        { RawHtmlBody: '<p>Facture jointe</p>' },
      ),
    ).toBe(false);
  });
});
