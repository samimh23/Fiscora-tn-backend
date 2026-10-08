import { HealthController } from './health.controller';

describe('HealthController', () => {
  const previous = process.env.APP_RELEASE_SHA;
  afterEach(() => {
    if (previous === undefined) delete process.env.APP_RELEASE_SHA;
    else process.env.APP_RELEASE_SHA = previous;
  });
  it('retourne un état sain en français', () => {
    delete process.env.APP_RELEASE_SHA;
    const result = new HealthController().health();

    expect(result).toEqual({
      status: 'healthy',
      message: 'L’API NestJS est opérationnelle.',
      releaseSha: 'unknown',
    });
  });

  it('identifie la version réellement servie pour vérifier le déploiement', () => {
    process.env.APP_RELEASE_SHA = 'a'.repeat(40);
    expect(new HealthController().health().releaseSha).toBe('a'.repeat(40));
  });
});
