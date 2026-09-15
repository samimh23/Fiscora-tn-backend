import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from './google-wif-token.service';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
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
        temperature: 0.2,
        max_tokens: 2400,
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
    const contentText = body.choices?.[0]?.message?.content;
    if (!contentText)
      throw new Error('NuExtract returned no extraction content.');
    const candidate = contentText
      .replace(/^\s*<answer>\s*/i, '')
      .replace(/\s*<\/answer>\s*$/i, '')
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '');
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error();
      data = parsed as Record<string, unknown>;
    } catch {
      throw new Error('NuExtract returned invalid structured JSON.');
    }
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
    };
  }

  private instructions() {
    return 'Classify document_type from visible evidence, then extract all applicable fields. Use null for unreadable or absent information and never infer hidden identifiers. Preserve printed identifiers exactly. Use ISO-8601 dates and ISO-4217 currencies. Return every monetary field as the exact printed string, including spaces and decimal separators; never remove punctuation or multiply by 1000. For Tunisian documents, DT means TND and a comma followed by three digits is a millime decimal separator: for example 3 782,353 must remain "3 782,353" and 1.459,000 must remain "1.459,000". Extract FODEC only into fodec_amount. Keep fiscal stamp separate in stamp_tax. Put other visible surcharges, duties, or levies into other_taxes, excluding TVA, FODEC, and fiscal stamp to avoid double counting. subtotal_excl_tax is the printed net HT amount after any discount. Financial values must be normalized and validated by the application before acceptance.';
  }
}
