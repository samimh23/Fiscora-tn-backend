import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from '../documents/extraction/google-wif-token.service';
import { AssistantReranker, diversify } from './reranker';

function reranker(values: Record<string, string>) {
  const config = {
    get: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
  const tokens = {
    accessToken: jest.fn().mockResolvedValue('token'),
  } as unknown as GoogleWifTokenService;
  return new AssistantReranker(config, tokens);
}

const candidates = [
  { id: 'a', title: 'a.pdf', content: 'Total TTC: 120' },
  { id: 'b', title: 'b.pdf', content: 'Lignes de facture' },
  { id: 'c', title: 'c.pdf', content: 'Banque BIAT' },
];

describe('AssistantReranker', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('does nothing unless switched on', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    await expect(
      reranker({ GCP_PROJECT_ID: 'p' }).rerank('q', candidates, 2),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the Vertex ranking endpoint and sorts the scores', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            { id: 'b', score: 0.4 },
            { id: 'c', score: 0.9 },
            { id: 'unknown', score: 1 },
          ],
        }),
    });
    global.fetch = fetchMock;
    const scores = await reranker({
      RAG_RERANKER: 'vertex',
      GCP_PROJECT_ID: 'fiscora-ai',
    }).rerank('Quel est le solde ?', candidates, 2);
    expect(scores).toEqual([
      { id: 'c', score: 0.9 },
      { id: 'b', score: 0.4 },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://discoveryengine.googleapis.com/v1/projects/fiscora-ai/locations/global/rankingConfigs/default_ranking_config:rank',
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'semantic-ranker-default@latest',
      query: 'Quel est le solde ?',
      topN: 2,
      records: [{ id: 'a', title: 'a.pdf' }, { id: 'b' }, { id: 'c' }],
    });
  });

  it('falls back to the hybrid order on an error or a timeout', async () => {
    const service = reranker({ RAG_RERANKER: 'vertex', GCP_PROJECT_ID: 'p' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('PERMISSION_DENIED'),
    });
    await expect(service.rerank('q', candidates, 2)).resolves.toBeNull();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('The operation timed out'));
    await expect(service.rerank('q', candidates, 2)).resolves.toBeNull();
  });
});

describe('diversify', () => {
  const rows = (ids: string) =>
    ids.split('').map((source_id, index) => ({ source_id, index }));

  it('caps chunks per document and keeps the ranking order', () => {
    expect(diversify(rows('aaaabc'), 4, 2).map((row) => row.index)).toEqual([
      0, 1, 4, 5,
    ]);
  });

  it('backfills free slots when few documents match', () => {
    expect(diversify(rows('aaaaa'), 4, 2).map((row) => row.index)).toEqual([
      0, 1, 2, 3,
    ]);
  });
});
