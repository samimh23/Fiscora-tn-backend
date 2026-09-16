export interface BrevoMailbox {
  Address?: string;
  Name?: string | null;
}

export interface BrevoInboundAttachment {
  Name?: string;
  ContentType?: string;
  ContentLength?: number;
  ContentID?: string;
  DownloadToken?: string;
}

export interface BrevoInboundItem {
  Uuid?: string[];
  MessageId?: string;
  From?: BrevoMailbox;
  To?: BrevoMailbox[];
  // Brevo's sample payload uses strings while parts of its reference describe
  // mailbox objects. Accept both so a provider-side representation change does
  // not silently break dossier routing.
  Recipients?: Array<string | BrevoMailbox>;
  Subject?: string;
  SentAtDate?: string;
  RawHtmlBody?: string | null;
  ExtractedMarkdownMessage?: string | null;
  Attachments?: BrevoInboundAttachment[];
}

export interface BrevoInboundPayload {
  items?: BrevoInboundItem[];
}
