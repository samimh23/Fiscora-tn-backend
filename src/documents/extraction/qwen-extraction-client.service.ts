import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from './google-wif-token.service';
import type {
  DocumentExtractionClient,
  FinancialDocumentKind,
} from './document-extraction-client';
import type { OcrDocument, OcrToken } from './ocr-evidence-matcher';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
}

@Injectable()
export class QwenExtractionClientService implements DocumentExtractionClient {
  readonly provider = 'qwen' as const;
  readonly modelName: string;
  private activeRequests = 0;
  private readonly requestWaiters: Array<() => void> = [];

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: GoogleWifTokenService,
  ) {
    this.modelName = this.config.get(
      'DOCUMENT_EXTRACTION_MODEL',
      'Qwen/Qwen3.5-4B',
    );
  }

  async extract(
    content: Buffer,
    mimeType: string,
    correctionIssues: Array<Record<string, unknown>> = [],
    documentKind: FinancialDocumentKind = 'auto',
  ) {
    void documentKind;
    return this.complete([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${content.toString('base64')}`,
            },
          },
          {
            type: 'text',
            text: extractionInstructions(correctionIssues),
          },
        ],
      },
    ]);
  }

  async extractFromOcr(
    document: OcrDocument,
    correctionIssues: Array<Record<string, unknown>> = [],
    documentKind: FinancialDocumentKind = 'auto',
  ) {
    void documentKind;
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
        this.complete([
          {
            role: 'system',
            content:
              'You map OCR tokens from financial documents into the exact Fiscora accounting schema. Return JSON only.',
          },
          {
            role: 'user',
            content: ocrExtractionInstructions(
              tokens,
              index,
              batches.length,
              correctionIssues,
            ),
          },
        ]),
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
    };
  }

  private async complete(messages: Array<Record<string, unknown>>) {
    await this.acquireRequestSlot();
    try {
      return await this.sendCompletion(messages);
    } finally {
      this.releaseRequestSlot();
    }
  }

  private async sendCompletion(messages: Array<Record<string, unknown>>) {
    // NUEXTRACT_SERVICE_URL remains a temporary fallback so the model can be
    // rolled out without coupling the Azure and GCP deployments.
    const serviceUrl = (
      this.config.get<string>('QWEN_SERVICE_URL') ??
      this.config.get<string>('DOCUMENT_EXTRACTION_SERVICE_URL')
    )?.replace(/\/$/, '');
    if (!serviceUrl)
      throw new Error('DOCUMENT_EXTRACTION_SERVICE_URL is not configured.');

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
        top_p: 0.8,
        top_k: 20,
        presence_penalty: 1.5,
        chat_template_kwargs: { enable_thinking: false },
        max_tokens: Math.min(
          8_000,
          Math.max(
            2_400,
            Number(
              this.config.get(
                'DOCUMENT_EXTRACTION_MAX_TOKENS',
                this.config.get('NUEXTRACT_MAX_TOKENS', 8_000),
              ),
            ),
          ),
        ),
        messages,
      }),
      signal: AbortSignal.timeout(
        Number(
          this.config.get(
            'DOCUMENT_EXTRACTION_TIMEOUT_MS',
            this.config.get('NUEXTRACT_TIMEOUT_MS', 600_000),
          ),
        ),
      ),
    });
    if (!response.ok) {
      throw new Error(
        `Qwen extraction failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
      );
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const choice = body.choices?.[0];
    const contentText = choice?.message?.content;
    if (!contentText) throw new Error('Qwen returned no extraction content.');

    const data = parseQwenExtractionJson(contentText, choice?.finish_reason);
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

  private requestConcurrency() {
    return this.configuredInteger(
      'DOCUMENT_EXTRACTION_QWEN_CONCURRENCY',
      4,
      32,
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

export function extractionInstructions(
  correctionIssues: Array<Record<string, unknown>> = [],
) {
  const correctionGuidance = correctionIssues.length
    ? `
The previous extraction failed these controls. Re-read the original image and correct these problems. Do not copy or infer values from the previous result:
${correctionIssues
  .slice(0, 20)
  .map((issue) => {
    const field = promptValue(issue.field, 'document');
    const message = promptValue(
      issue.message,
      promptValue(issue.code, 'invalid value'),
    );
    return `- ${field}: ${message}`;
  })
  .join('\n')}
`
    : '';
  return `
Extract this financial document and return valid JSON only.

Use exactly one of these document_type values:
invoice, credit_note, receipt, bank_statement, other.

For invoice, credit_note, or receipt, return exactly:
{
  "document_type": "invoice",
  "supplier": {
    "name": null,
    "tax_id": null,
    "registration_number": null,
    "address": null
  },
  "customer": {
    "name": null,
    "tax_id": null,
    "registration_number": null,
    "address": null
  },
  "document_number": null,
  "issue_date": null,
  "currency": null,
  "gross_subtotal_excl_tax": null,
  "global_discount_amount": null,
  "global_discount_rate": null,
  "subtotal_excl_tax": null,
  "tax_amount": null,
  "fodec_amount": null,
  "stamp_tax": null,
  "other_taxes": [
    {
      "label": null,
      "amount": null
    }
  ],
  "total_incl_tax": null,
  "amount_due": null,
  "additional_fields": [
    {
      "label": null,
      "value": null
    }
  ],
  "line_items": [
    {
      "reference": null,
      "barcode": null,
      "description": null,
      "quantity": null,
      "unit_price": null,
      "unit_price_basis": "unknown",
      "discount_rate": null,
      "tax_rate": null,
      "line_total": null,
      "line_total_basis": "unknown"
    }
  ]
}

For a bank statement, return exactly:
{
  "document_type": "bank_statement",
  "currency": null,
  "bank_statement": {
    "bank_name": null,
    "iban": null,
    "account_number": null,
    "period_start": null,
    "period_end": null,
    "opening_balance": null,
    "closing_balance": null,
    "transactions": [
      {
        "transaction_date": null,
        "value_date": null,
        "description": null,
        "reference": null,
        "debit": null,
        "credit": null,
        "amount": null,
        "balance": null
      }
    ]
  }
}

Rules:
- Return JSON only, without Markdown or explanations.
- Keep monetary values as strings exactly as printed, including spaces, commas and points.
- Convert dates to YYYY-MM-DD.
- On French and Tunisian documents, DD/MM/YYYY means day/month/year: for example 26/03/2024 must become 2024-03-26, never 2024-06-26.
- Use null when a value is absent or unreadable.
- Never invent, calculate, merge, repeat or move values.
- For invoices, gross_subtotal_excl_tax is the printed HT before a global discount, global_discount_amount/global_discount_rate are the printed global discount, and subtotal_excl_tax is the taxable HT after that discount (often labelled Base TVA or Net HT).
- For invoices, total_incl_tax is the printed TTC before stamp duty and amount_due is the printed net payable after stamp duty. Copy the two values separately even when their labels are close together.
- One printed table row must produce exactly one JSON row.
- Never combine two adjacent printed rows.
- Preserve duplicate descriptions as separate transactions.
- Read each amount from the same horizontal line as its description.
- If debit is present, credit must be null.
- If credit is present, debit must be null.
- Do not calculate a net amount from debit and credit.
- Before returning JSON, verify that the JSON transaction count equals the number of printed transaction rows.
- A transaction must not contain both a debit and a credit unless both are visibly printed on that same row.
- unit_price_basis and line_total_basis must be exactly HT, TTC, or unknown according to the printed column label. Never treat PU TTC as PU HT.
- Do not return coordinates, bounding boxes, visual evidence, source token IDs, or an _evidence field. Fiscora matches values to OCR coordinates separately.
${correctionGuidance}
`;
}

export function ocrTokenBatches(
  tokens: OcrToken[],
  pagesPerBatch: number,
  maximumCharacters = 28_000,
) {
  const batchSize = Number.isFinite(pagesPerBatch)
    ? Math.max(1, Math.floor(pagesPerBatch))
    : 1;
  const characterLimit = Number.isFinite(maximumCharacters)
    ? Math.max(1_000, Math.floor(maximumCharacters))
    : 28_000;
  const pageNumbers = [...new Set(tokens.map((token) => token.page))].sort(
    (left, right) => left - right,
  );
  const batches: OcrToken[][] = [];
  let current: OcrToken[] = [];
  let currentPages = 0;
  let currentCharacters = 0;
  for (const page of pageNumbers) {
    const pageTokens = tokens.filter((token) => token.page === page);
    const pageCharacters = pageTokens.reduce(
      (total, token) => total + compactOcrToken(token).length,
      0,
    );
    if (
      current.length &&
      (currentPages >= batchSize ||
        currentCharacters + pageCharacters > characterLimit)
    ) {
      batches.push(current);
      current = [];
      currentPages = 0;
      currentCharacters = 0;
    }
    for (const token of pageTokens) {
      const tokenCharacters = compactOcrToken(token).length;
      if (
        current.length &&
        currentCharacters + tokenCharacters > characterLimit
      ) {
        batches.push(current);
        current = [];
        currentPages = 0;
        currentCharacters = 0;
      }
      current.push(token);
      currentCharacters += tokenCharacters;
    }
    currentPages += 1;
  }
  if (current.length) batches.push(current);
  return batches.filter((batch) => batch.length > 0);
}

export function ocrExtractionInstructions(
  tokens: OcrToken[],
  batchIndex: number,
  batchCount: number,
  correctionIssues: Array<Record<string, unknown>> = [],
) {
  const compactTokens = tokens.map((token) => [
    token.id,
    token.page,
    token.text,
    token.confidence,
    token.bbox,
  ]);
  return `${extractionInstructions(correctionIssues)}

The original document was read by OCR. This is page batch ${batchIndex + 1} of ${batchCount}.
- Extract only values and rows visibly supported by OCR_INPUT.
- Use page and bbox positions to reconstruct columns and rows.
- A repeated table header is not a transaction or invoice line.
- Do not emit placeholder rows when this page batch has no visible row.
- Other batches from the same document will be merged deterministically.

OCR_INPUT:
${JSON.stringify({ fields: ['id', 'page', 'text', 'confidence', 'bbox'], tokens: compactTokens })}`;
}

function compactOcrToken(token: OcrToken) {
  return JSON.stringify([
    token.id,
    token.page,
    token.text,
    token.confidence,
    token.bbox,
  ]);
}

const COLLECTED_ARRAY_PATHS = new Set([
  'line_items',
  'additional_fields',
  'other_taxes',
  'bank_statement.transactions',
]);

const PREFER_LATER_PATHS = new Set([
  'gross_subtotal_excl_tax',
  'global_discount_amount',
  'global_discount_rate',
  'subtotal_excl_tax',
  'tax_amount',
  'fodec_amount',
  'stamp_tax',
  'total_incl_tax',
  'amount_due',
  'bank_statement.period_end',
  'bank_statement.closing_balance',
]);

export function mergeExtractionBatches(
  batches: Array<Record<string, unknown>>,
): Record<string, unknown> {
  if (!batches.length) throw new Error('Qwen returned no extraction batches.');
  const result: Record<string, unknown> = {};
  for (const batch of batches) mergeRecord(result, batch, '');

  const types = batches
    .map((batch) => batch.document_type)
    .filter((value): value is string => typeof value === 'string');
  result.document_type =
    types.find((value) => value !== 'other') ?? types[0] ?? 'other';
  return result;
}

function mergeRecord(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  parentPath: string,
) {
  for (const [key, sourceValue] of Object.entries(source)) {
    if (key === '_evidence') continue;
    const path = parentPath ? `${parentPath}.${key}` : key;
    const targetValue = target[key];
    if (Array.isArray(sourceValue)) {
      const sourceArray = sourceValue as unknown[];
      const usefulValues = sourceArray.filter(hasUsefulValue);
      if (!COLLECTED_ARRAY_PATHS.has(path)) {
        if (targetValue === undefined && usefulValues.length)
          target[key] = structuredClone(usefulValues);
        continue;
      }
      const existing: unknown[] = Array.isArray(targetValue)
        ? (targetValue as unknown[])
        : [];
      target[key] = [...existing, ...structuredClone(usefulValues)];
      continue;
    }
    if (isRecord(sourceValue)) {
      const nested = isRecord(targetValue) ? targetValue : {};
      mergeRecord(nested, sourceValue, path);
      target[key] = nested;
      continue;
    }
    if (!hasUsefulValue(sourceValue)) {
      if (!(key in target)) target[key] = null;
      continue;
    }
    if (
      !hasUsefulValue(targetValue) ||
      PREFER_LATER_PATHS.has(path) ||
      (path === 'document_type' && targetValue === 'other')
    ) {
      target[key] = sourceValue;
    }
  }
}

function hasUsefulValue(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.some(hasUsefulValue);
  if (isRecord(value)) return Object.values(value).some(hasUsefulValue);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function promptValue(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return value.toString();
  return fallback;
}

export function parseQwenExtractionJson(
  contentText: string,
  finishReason?: string | null,
): Record<string, unknown> {
  let candidate = contentText
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace)
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    if (finishReason === 'length')
      throw new Error(
        'Qwen response was truncated before completing the structured JSON.',
      );
    throw new Error('Qwen returned invalid structured JSON.');
  }
}
