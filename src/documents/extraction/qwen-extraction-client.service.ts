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

  async extract(content: Buffer, mimeType: string) {
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
                text: extractionInstructions(),
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
      rawResponse: { content: contentText, usage: body.usage ?? null },
    };
  }
}

export function extractionInstructions() {
  return 'Extract this financial document to valid JSON. Use document_type as invoice, credit_note, bank_statement, receipt, or other. Copy every visible field and every table row in printed order. Preserve all text and numbers exactly as printed, including spaces, commas and points. One printed row must equal one JSON row. For an empty value use null. Never merge rows, shift values, repeat values, calculate, normalize or guess. Return JSON only.';
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
