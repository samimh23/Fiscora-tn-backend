import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from './google-wif-token.service';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
}

@Injectable()
export class QwenExtractionClientService {
  readonly modelName: string;

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
  ) {
    // NUEXTRACT_SERVICE_URL remains a temporary fallback so the model can be
    // rolled out without coupling the Azure and GCP deployments.
    const serviceUrl = (
      this.config.get<string>('DOCUMENT_EXTRACTION_SERVICE_URL') ??
      this.config.get<string>('NUEXTRACT_SERVICE_URL')
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
        temperature: 0.7,
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
        messages: [
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
        ],
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
      rawResponse: {
        content: contentText,
        usage: body.usage ?? null,
        extractedData: structuredClone(data),
      },
    };
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
    "address": null
  },
  "customer": {
    "name": null,
    "tax_id": null,
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
      "description": null,
      "quantity": null,
      "unit_price": null,
      "discount_rate": null,
      "tax_rate": null,
      "line_total": null
    }
  ],
  "_evidence": {}
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
  },
  "_evidence": {}
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
- Add visual evidence in _evidence for every visible header value using its JSON path as the key.
- For each invoice line, add one _evidence entry keyed line_items.N. For each bank row, add one entry keyed bank_statement.transactions.N, where N starts at 0.
- Each evidence entry must be {"page": 1, "text": "exact printed text", "bbox": [x1, y1, x2, y2]}.
- bbox coordinates must be integers normalized from 0 to 1000 relative to the full original image: top-left is [0,0] and bottom-right is [1000,1000].
- The evidence box must tightly cover only the printed value or the corresponding printed table row. Omit evidence when the value is absent or unreadable; never invent coordinates.
${correctionGuidance}
`;
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
