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

  it('routes a live-data question with a constrained JSON schema, not SQL', async () => {
    const intent = {
      operation: 'BALANCES',
      partyName: 'MYTEK',
      partyType: 'SUPPLIER',
      invoiceNumber: null,
      paymentReference: null,
      year: null,
      unsupportedPeriod: false,
    };
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(intent) }] } },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(
      client.routeLiveFinancialQuestion('How much do we owe MYTEK?'),
    ).resolves.toEqual(intent);
    const body = fetchMock.mock.calls[0][1]?.body;
    if (typeof body !== 'string') throw new Error('Expected JSON request body');
    const payload = JSON.parse(body) as {
      generationConfig: {
        responseMimeType: string;
        responseSchema: { properties: { operation: { enum: string[] } } };
      };
    };
    expect(payload.generationConfig.responseMimeType).toBe('application/json');
    expect(
      payload.generationConfig.responseSchema.properties.operation.enum,
    ).toEqual(['BALANCES', 'INVOICE_DETAILS', 'FINANCIAL_SUMMARY', 'NONE']);
  });

  it.each([
    'not JSON',
    JSON.stringify({ operation: 'EXECUTE_SQL' }),
    JSON.stringify({
      operation: 'BALANCES',
      partyName: 'Invented supplier',
      partyType: 'SUPPLIER',
      invoiceNumber: null,
      paymentReference: null,
      year: null,
      unsupportedPeriod: false,
    }),
  ])('rejects invalid or hallucinated routes: %s', async (text) => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
        { status: 200 },
      ),
    );
    await expect(
      client.routeLiveFinancialQuestion('How much do we owe MYTEK?'),
    ).rejects.toThrow('Impossible de déterminer');
  });
});
