import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('retourne un état sain en français', () => {
    const result = new HealthController().health();

    expect(result).toEqual({
      status: 'healthy',
      message: 'L’API NestJS est opérationnelle.',
    });
  });
});
