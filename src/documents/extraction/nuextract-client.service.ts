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
export class NuExtractClientService {
  readonly modelName = 'numind/NuExtract3';

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: GoogleWifTokenService,
  ) {}

  async extract(content: Buffer, mimeType: string) {
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
          6_000,
          Math.max(
            2_400,
            Number(this.config.get('NUEXTRACT_MAX_TOKENS', 6_000)),
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
            ],
          },
        ],
        chat_template_kwargs: {
          template: JSON.stringify(this.template()),
          instructions: this.instructions(),
          enable_thinking: false,
        },
      }),
      signal: AbortSignal.timeout(
        Number(this.config.get('NUEXTRACT_TIMEOUT_MS', 600_000)),
      ),
    });
    if (!response.ok) {
      throw new Error(
        `NuExtract failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
      );
    }
    const body = (await response.json()) as ChatCompletionResponse;
    const choice = body.choices?.[0];
    const contentText = choice?.message?.content;
    if (!contentText)
      throw new Error('NuExtract returned no extraction content.');
    const data = parseNuExtractJson(contentText, choice?.finish_reason);
    return {
      data,
      rawResponse: { content: contentText, usage: body.usage ?? null },
    };
  }

  private template() {
    return {
      document_type: [
        'invoice',
        'credit_note',
        'bank_statement',
        'receipt',
        'other',
      ],
      supplier: {
        name: 'verbatim-string',
        tax_id: 'verbatim-string',
        address: 'verbatim-string',
      },
      customer: {
        name: 'verbatim-string',
        customer_id: 'verbatim-string',
        address: 'verbatim-string',
      },
      document_number: 'verbatim-string',
      issue_date: 'date-time',
      currency: 'currency',
      subtotal_excl_tax: 'verbatim-string',
      tax_amount: 'verbatim-string',
      fodec_amount: 'verbatim-string',
      stamp_tax: 'verbatim-string',
      other_taxes: [
        {
          label: 'verbatim-string',
          amount: 'verbatim-string',
        },
      ],
      total_incl_tax: 'verbatim-string',
      amount_due: 'verbatim-string',
      line_items: [
        {
          description: 'verbatim-string',
          quantity: 'number',
          unit_price: 'verbatim-string',
          tax_rate: 'number',
          line_total: 'verbatim-string',
        },
      ],
      bank_statement: {
        bank_name: 'verbatim-string',
        iban: 'verbatim-string',
        account_number: 'verbatim-string',
        period_start: 'date-time',
        period_end: 'date-time',
        opening_balance: 'verbatim-string',
        closing_balance: 'verbatim-string',
        transactions: [
          {
            transaction_date: 'date-time',
            value_date: 'date-time',
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
  }

  private instructions() {
    return 'Classify document_type from visible evidence, then extract only the matching section. Use null for unreadable or absent information and never infer hidden identifiers. Preserve printed identifiers exactly. Use ISO-8601 dates and ISO-4217 currencies. Return every monetary field as the exact printed string, including spaces and decimal separators; never remove punctuation or multiply by 1000. For Tunisian documents, DT means TND and a comma followed by three digits is a millime decimal separator: for example 3 782,353 must remain "3 782,353" and 1.459,000 must remain "1.459,000". For invoices, extract FODEC only into fodec_amount, keep fiscal stamp separate in stamp_tax, and put other visible surcharges into other_taxes. For bank statements, fill bank_statement and return every visible transaction in printed order; use debit or credit when printed, otherwise amount; never invent a missing page or balance. Financial values must be normalized and validated by the application before acceptance.';
  }
}

export function parseNuExtractJson(
  contentText: string,
  finishReason?: string | null,
): Record<string, unknown> {
  let candidate = contentText
    .replace(/^\s*<answer>\s*/i, '')
    .replace(/\s*<\/answer>\s*$/i, '')
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
        'NuExtract response was truncated before completing the structured JSON.',
      );
    throw new Error('NuExtract returned invalid structured JSON.');
  }
}
