import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from '../documents/extraction/google-wif-token.service';

interface VertexEmbeddingResponse {
  predictions?: Array<{ embeddings?: { values?: number[] } }>;
}

interface VertexGenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  modelVersion?: string;
  usageMetadata?: Record<string, unknown>;
}

interface VertexAnswer {
  text: string;
  model: string;
  usage: Record<string, unknown> | null;
}

@Injectable()
export class VertexAiClient {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: GoogleWifTokenService,
  ) {}

  get chatModel(): string {
    return (
      this.config.get<string>('VERTEX_AI_CHAT_MODEL') ?? 'gemini-2.5-flash'
    );
  }

  async embed(
    content: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  ): Promise<number[]> {
    const model =
      this.config.get<string>('VERTEX_AI_EMBEDDING_MODEL') ??
      'gemini-embedding-001';
    const body = await this.request<VertexEmbeddingResponse>(
      `${this.modelUrl(model)}:predict`,
      {
        instances: [{ content, task_type: taskType }],
        parameters: {
          autoTruncate: true,
          outputDimensionality: Number(
            this.config.get<string>('VERTEX_AI_EMBEDDING_DIMENSIONS') ?? '768',
          ),
        },
      },
    );
    const values = body.predictions?.[0]?.embeddings?.values;
    if (!values?.length)
      throw new ServiceUnavailableException(
        'Vertex AI n’a retourné aucun vecteur.',
      );
    return values;
  }

  async answer(question: string, context: string): Promise<VertexAnswer> {
    const body = await this.request<VertexGenerateResponse>(
      `${this.modelUrl(this.chatModel)}:generateContent`,
      {
        systemInstruction: {
          parts: [
            {
              text: 'Vous êtes l’assistant comptable Fiscora. Répondez uniquement à partir des sources fournies. Citez les sources avec [S1], [S2], etc. Si les sources ne suffisent pas, dites-le clairement. N’inventez jamais une valeur financière, une règle ou une échéance. Ne proposez aucune comptabilisation automatique et rappelez qu’une validation humaine reste nécessaire pour toute décision comptable ou fiscale.',
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Question:\n${question}\n\nSources autorisées:\n${context}`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
      },
    );
    const text = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text)
      throw new ServiceUnavailableException(
        'Vertex AI n’a retourné aucune réponse.',
      );
    return {
      text,
      model: body.modelVersion ?? this.chatModel,
      usage: body.usageMetadata ?? null,
    };
  }

  private modelUrl(model: string) {
    const project = this.required('GCP_PROJECT_ID');
    const location = this.config.get<string>('VERTEX_AI_LOCATION') ?? 'global';
    const host =
      location === 'global'
        ? 'https://aiplatform.googleapis.com'
        : `https://${location}-aiplatform.googleapis.com`;
    return `${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}`;
  }

  private async request<T>(url: string, payload: unknown): Promise<T> {
    const token = await this.tokens.accessToken();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(
        Number(this.config.get<string>('VERTEX_AI_TIMEOUT_MS') ?? '60000'),
      ),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new ServiceUnavailableException(
        `Vertex AI indisponible (${response.status}): ${detail}`,
      );
    }
    return (await response.json()) as T;
  }

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value)
      throw new ServiceUnavailableException(`${name} n’est pas configuré.`);
    return value;
  }
}
