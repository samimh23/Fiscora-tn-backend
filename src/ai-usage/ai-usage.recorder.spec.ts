import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import {
  AiUsageRecorder,
  estimateCostUsd,
  vertexTokens,
} from './ai-usage.recorder';

describe('AI usage', () => {
  it('prices Gemini, embeddings and ranking calls, and not self-hosted services', () => {
    expect(
      estimateCostUsd({
        provider: 'vertex',
        model: 'gemini-2.5-flash',
        status: 'OK',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(2.8);
    expect(
      estimateCostUsd({
        provider: 'vertex',
        model: 'gemini-embedding-001',
        status: 'OK',
        inputTokens: 2_000_000,
      }),
    ).toBeCloseTo(0.3);
    expect(
      estimateCostUsd({ provider: 'ranking', model: 'r', status: 'OK' }),
    ).toBeCloseTo(0.001);
    expect(
      estimateCostUsd({ provider: 'ranking', model: 'r', status: 'FALLBACK' }),
    ).toBe(0);
    expect(
      estimateCostUsd({
        provider: 'nuextract',
        model: 'numind/NuExtract3',
        status: 'OK',
        inputTokens: 5000,
      }),
    ).toBe(0);
  });

  it('reads tokens from Gemini answers, counting thinking as output, and from embeddings', () => {
    expect(
      vertexTokens({
        usageMetadata: {
          promptTokenCount: 120,
          candidatesTokenCount: 30,
          thoughtsTokenCount: 5,
        },
      }),
    ).toEqual({ inputTokens: 120, outputTokens: 35 });
    expect(
      vertexTokens({
        predictions: [{ embeddings: { statistics: { token_count: 42 } } }],
      }),
    ).toEqual({ inputTokens: 42, outputTokens: 0 });
    expect(vertexTokens(null)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('writes one row with the estimated cost and never throws when the insert fails', async () => {
    const query = jest.fn().mockRejectedValue(new Error('database down'));
    const recorder = new AiUsageRecorder(
      { query } as unknown as DataSource,
      new ConfigService({ AI_PRICE_FLASH_OUTPUT_PER_M: '10' }),
    );
    expect(() =>
      recorder.record({
        feature: 'assistant_answer',
        provider: 'vertex',
        model: 'gemini-2.5-flash',
        status: 'OK',
        latencyMs: 812.4,
        outputTokens: 1_000_000,
      }),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    const params = (query.mock.calls as unknown[][])[0][1] as unknown[];
    expect(params.slice(0, 6)).toEqual([
      'assistant_answer',
      'vertex',
      'gemini-2.5-flash',
      'OK',
      null,
      812,
    ]);
    // The configured price override applies: 1M output tokens at $10.
    expect(params[10]).toBe('10.00000000');
  });
});
