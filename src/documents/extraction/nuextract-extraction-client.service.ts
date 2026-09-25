import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DocumentExtractionClient,
  ExtractionClientResult,
  FinancialDocumentKind,
} from './document-extraction-client';
import { GoogleWifTokenService } from './google-wif-token.service';
import type { OcrDocument, OcrToken } from './ocr-evidence-matcher';
import {
  mergeExtractionBatches,
  ocrTokenBatches,
  parseQwenExtractionJson,
} from './qwen-extraction-client.service';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
}

const INVOICE_TEMPLATE = {
  document_type: ['invoice', 'credit_note', 'receipt'],
  supplier: {
    name: 'verbatim-string',
    tax_id: 'verbatim-string',
    registration_number: 'verbatim-string',
    address: 'verbatim-string',
  },
  customer: {
    name: 'verbatim-string',
    tax_id: 'verbatim-string',
    registration_number: 'verbatim-string',
    address: 'verbatim-string',
  },
  document_number: 'verbatim-string',
  issue_date: 'verbatim-string',
  currency: 'verbatim-string',
  gross_subtotal_excl_tax: 'verbatim-string',
  global_discount_amount: 'verbatim-string',
  global_discount_rate: 'verbatim-string',
  subtotal_excl_tax: 'verbatim-string',
  tax_amount: 'verbatim-string',
  fodec_amount: 'verbatim-string',
  stamp_tax: 'verbatim-string',
  other_taxes: [{ label: 'verbatim-string', amount: 'verbatim-string' }],
  total_incl_tax: 'verbatim-string',
  amount_due: 'verbatim-string',
  additional_fields: [{ label: 'verbatim-string', value: 'verbatim-string' }],
  line_items: [
    {
      reference: 'verbatim-string',
      barcode: 'verbatim-string',
      description: 'verbatim-string',
      quantity: 'verbatim-string',
      unit_price: 'verbatim-string',
      unit_price_basis: ['HT', 'TTC', 'unknown'],
      discount_rate: 'verbatim-string',
      tax_rate: 'verbatim-string',
      line_total: 'verbatim-string',
      line_total_basis: ['HT', 'TTC', 'unknown'],
    },
  ],
};

const BANK_STATEMENT_TEMPLATE = {
  document_type: ['bank_statement'],
  currency: 'verbatim-string',
  bank_statement: {
    bank_name: 'verbatim-string',
    iban: 'verbatim-string',
    account_number: 'verbatim-string',
    period_start: 'verbatim-string',
    period_end: 'verbatim-string',
    opening_balance: 'verbatim-string',
    closing_balance: 'verbatim-string',
    transactions: [
      {
        transaction_date: 'verbatim-string',
        value_date: 'verbatim-string',
        description: 'verbatim-string',
        reference: 'verbatim-string',
        debit: 'verbatim-string',
        credit: 'verbatim-string',
        amount: 'verbatim-string',
        balance: 'verbatim-string',
      },
    ],
  },
};

@Injectable()
export class NuExtractExtractionClientService implements DocumentExtractionClient {
  readonly provider = 'nuextract' as const;
  readonly modelName: string;
  private activeRequests = 0;
  private readonly requestWaiters: Array<() => void> = [];

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: GoogleWifTokenService,
  ) {
    this.modelName = this.config.get('NUEXTRACT_MODEL', 'numind/NuExtract3');
  }

  async extract(
    content: Buffer,
    mimeType: string,
    correctionIssues: Array<Record<string, unknown>> = [],
    documentKind: FinancialDocumentKind = 'invoice',
  ) {
    this.assertFixedKind(documentKind);
    return this.complete(
      [
        {
          role: 'system',
          content: nuextractInstructions(documentKind, correctionIssues),
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${content.toString('base64')}`,
              },
            },
          ],
        },
      ],
      templateFor(documentKind),
    );
  }

  async extractFromOcr(
    document: OcrDocument,
    correctionIssues: Array<Record<string, unknown>> = [],
    documentKind: FinancialDocumentKind = 'invoice',
  ) {
    this.assertFixedKind(documentKind);
    const batches = ocrTokenBatches(
      document.tokens,
      this.configuredInteger('DOCUMENT_EXTRACTION_OCR_BATCH_PAGES', 4, 10),
      this.configuredInteger(
        'DOCUMENT_EXTRACTION_OCR_BATCH_MAX_CHARS',
        28_000,
        60_000,
      ),
    );
    if (!batches.length) throw new Error('PaddleOCR returned no OCR tokens.');

    const extracted = await Promise.all(
      batches.map((tokens, index) =>
        this.complete(
          [
            {
              role: 'system',
              content: nuextractInstructions(documentKind, correctionIssues),
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: nuextractOcrInstructions(
                    documentKind,
                    tokens,
                    index,
                    batches.length,
                  ),
                },
              ],
            },
          ],
          templateFor(documentKind),
        ),
      ),
    );
    const data = mergeExtractionBatches(extracted.map((item) => item.data));
    return {
      data,
      modelName: this.modelName,
      provider: this.provider,
      rawResponse: {
        provider: this.provider,
        modelName: this.modelName,
        content: JSON.stringify(data),
        batches: extracted.map((item, index) => ({
          index,
          pages: [...new Set(batches[index].map((token) => token.page))],
          tokenCount: batches[index].length,
          content: item.rawResponse.content,
          usage: item.rawResponse.usage,
        })),
        extractedData: structuredClone(data),
      },
    } satisfies ExtractionClientResult;
  }

  private async complete(
    messages: Array<Record<string, unknown>>,
    template: Record<string, unknown>,
  ): Promise<ExtractionClientResult> {
    await this.acquireRequestSlot();
    try {
      return await this.sendCompletion(messages, template);
    } finally {
      this.releaseRequestSlot();
    }
  }

  private async sendCompletion(
    messages: Array<Record<string, unknown>>,
    template: Record<string, unknown>,
  ): Promise<ExtractionClientResult> {
    const serviceUrl = this.config
      .get<string>('NUEXTRACT_SERVICE_URL')
      ?.replace(/\/$/, '');
    if (!serviceUrl)
      throw new Error('NUEXTRACT_SERVICE_URL is not configured.');

    const identityToken = await this.tokens.identityToken(serviceUrl);
    const response = await fetch(`${serviceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${identityToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
        temperature: 0,
        max_tokens: Math.min(
          8_000,
          Math.max(
            2_400,
            Number(this.config.get('DOCUMENT_EXTRACTION_MAX_TOKENS', 8_000)),
          ),
        ),
        messages: messages.filter((message) => message.role !== 'system'),
        chat_template_kwargs: {
          template: JSON.stringify(template),
          instructions: messages.find((message) => message.role === 'system')
            ?.content,
          enable_thinking: false,
        },
      }),
      signal: AbortSignal.timeout(
        Number(this.config.get('DOCUMENT_EXTRACTION_TIMEOUT_MS', 600_000)),
      ),
    });
    if (!response.ok)
      throw new Error(
        `NuExtract extraction failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
      );

    const body = (await response.json()) as ChatCompletionResponse;
    const choice = body.choices?.[0];
    const contentText = choice?.message?.content;
    if (!contentText)
      throw new Error('NuExtract returned no extraction content.');
    let data: Record<string, unknown>;
    try {
      data = parseQwenExtractionJson(contentText, choice?.finish_reason);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'invalid structured JSON';
      throw new Error(message.replaceAll('Qwen', 'NuExtract'));
    }
    return {
      data,
      modelName: this.modelName,
      provider: this.provider,
      rawResponse: {
        provider: this.provider,
        modelName: this.modelName,
        content: contentText,
        usage: body.usage ?? null,
        extractedData: structuredClone(data),
      },
    };
  }

  private assertFixedKind(documentKind: FinancialDocumentKind) {
    if (documentKind === 'auto')
      throw new Error(
        'NuExtract requires an invoice or bank-statement category.',
      );
  }

  private requestConcurrency() {
    return this.configuredInteger(
      'DOCUMENT_EXTRACTION_NUEXTRACT_CONCURRENCY',
      2,
      8,
    );
  }

  private configuredInteger(name: string, fallback: number, maximum: number) {
    const configured = Number(this.config.get(name, fallback));
    return Number.isFinite(configured)
      ? Math.min(maximum, Math.max(1, Math.floor(configured)))
      : fallback;
  }

  private async acquireRequestSlot() {
    if (this.activeRequests < this.requestConcurrency()) {
      this.activeRequests += 1;
      return;
    }
    await new Promise<void>((resolve) => this.requestWaiters.push(resolve));
  }

  private releaseRequestSlot() {
    const next = this.requestWaiters.shift();
    if (next) next();
    else this.activeRequests = Math.max(0, this.activeRequests - 1);
  }
}

export function templateFor(documentKind: FinancialDocumentKind) {
  if (documentKind === 'invoice') return structuredClone(INVOICE_TEMPLATE);
  if (documentKind === 'bank_statement')
    return structuredClone(BANK_STATEMENT_TEMPLATE);
  throw new Error('A fixed NuExtract document kind is required.');
}

export function nuextractInstructions(
  documentKind: FinancialDocumentKind,
  correctionIssues: Array<Record<string, unknown>> = [],
) {
  const typeLabel =
    documentKind === 'bank_statement' ? 'bank statement' : 'invoice';
  const corrections = correctionIssues.length
    ? `\nThe previous extraction failed these controls. Re-read the source and correct them without copying values from the previous result:\n${correctionIssues
        .slice(0, 20)
        .map(
          (issue) =>
            `- ${safeIssueValue(issue.field, 'document')}: ${safeIssueValue(issue.message ?? issue.code, 'invalid value')}`,
        )
        .join('\n')}\n`
    : '';
  return `Extract this ${typeLabel} into the supplied JSON template.
- Copy only values visibly present in the source.
- Preserve monetary strings exactly, including spaces, commas, points and leading zeros.
- Never invent, calculate, correct, merge, repeat or move values.
- Return null for an absent scalar and [] for an absent list.
- One visible table row must produce exactly one output row.
- Dates printed as DD/MM/YYYY are day/month/year.
- For bank transactions, never put the same printed amount in both debit and credit.
- For invoice lines, distinguish HT from TTC using the printed column heading.
- supplier.tax_id and customer.tax_id must come only from labels such as MF, matricule fiscal or tax ID.
- Never use an IBAN, RIB, bank account, phone, barcode, RC or registration number as a tax_id.
- Return JSON only.${corrections}`;
}

export function nuextractOcrInstructions(
  documentKind: FinancialDocumentKind,
  tokens: OcrToken[],
  batchIndex: number,
  batchCount: number,
) {
  const compactTokens = tokens.map((token) => [
    token.id,
    token.page,
    token.text,
    token.confidence,
    token.bbox,
  ]);
  return `This is OCR text for a ${documentKind === 'bank_statement' ? 'bank statement' : 'invoice'}, page batch ${batchIndex + 1} of ${batchCount}.
- Use page and bbox positions to reconstruct columns and rows.
- Repeated table headers are not data rows.
- Do not emit placeholder rows when this batch has no visible row.

OCR_INPUT:
${JSON.stringify({ fields: ['id', 'page', 'text', 'confidence', 'bbox'], tokens: compactTokens })}`;
}

function safeIssueValue(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return value.toString();
  return fallback;
}
