import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from '../documents/extraction/google-wif-token.service';
import { VertexAiClient } from './vertex-ai.client';

describe('VertexAiClient', () => {
  const settings: Record<string, string> = {
    GCP_PROJECT_ID: 'fiscora-ai',
    VERTEX_AI_LOCATION: 'global',
    VERTEX_AI_CHAT_MODEL: 'gemini-2.5-flash',
    VERTEX_AI_EMBEDDING_MODEL: 'gemini-embedding-001',
    VERTEX_AI_EMBEDDING_DIMENSIONS: '768',
    VERTEX_AI_TIMEOUT_MS: '5000',
  };
  const config = {
    get: jest.fn((name: string) => settings[name]),
  } as unknown as ConfigService;
  const tokens = {
    accessToken: jest.fn().mockResolvedValue('federated-access-token'),
  } as unknown as GoogleWifTokenService;
  let client: VertexAiClient;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new VertexAiClient(config, tokens);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('requests a fixed-size retrieval embedding with a federated token', async () => {
    const vector = Array.from({ length: 768 }, () => 0.25);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ predictions: [{ embeddings: { values: vector } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      client.embed('Facture validée', 'RETRIEVAL_DOCUMENT'),
    ).resolves.toEqual(vector);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('gemini-embedding-001:predict'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer federated-access-token',
        }) as Record<string, string>,
      }),
    );
  });

  it('returns the grounded Gemini answer and usage metadata', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Réponse [S1]' }] } }],
          modelVersion: 'gemini-2.5-flash-001',
          usageMetadata: { totalTokenCount: 42 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      client.answer('Quel total ?', '[S1] Facture'),
    ).resolves.toEqual({
      text: 'Réponse [S1]',
      model: 'gemini-2.5-flash-001',
      usage: { totalTokenCount: 42 },
    });
  });
});
