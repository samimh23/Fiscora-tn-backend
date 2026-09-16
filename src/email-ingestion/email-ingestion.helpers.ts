import type {
  BrevoInboundAttachment,
  BrevoInboundItem,
} from './email-ingestion.types';

const normalizeEmail = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[^\s@]+@[^\s@]+$/.test(normalized) ? normalized : null;
};

export const brevoRecipientAddresses = (item: BrevoInboundItem) =>
  [
    ...(item.Recipients ?? []).map((recipient) =>
      typeof recipient === 'string' ? recipient : (recipient.Address ?? ''),
    ),
    ...(item.To ?? []).map((mailbox) => mailbox.Address ?? ''),
  ]
    .map((address) => normalizeEmail(address))
    .filter((address): address is string => Boolean(address))
    .filter((address, index, values) => values.indexOf(address) === index)
    .slice(0, 50);

export const isBrevoInlineAttachment = (
  attachment: BrevoInboundAttachment,
  item: BrevoInboundItem,
) => {
  const contentId = attachment.ContentID?.trim().replace(/^<|>$/g, '');
  if (!contentId) return false;
  const html = item.RawHtmlBody ?? '';
  const markdown = item.ExtractedMarkdownMessage ?? '';
  return (
    html.toLowerCase().includes(`cid:${contentId.toLowerCase()}`) ||
    markdown.includes(`(${contentId})`)
  );
};
