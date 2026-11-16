import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from './google-wif-token.service';

function service(values: Record<string, string>) {
  return new GoogleWifTokenService({
    get: (name: string) => values[name],
  } as unknown as ConfigService);
}

describe('GoogleWifTokenService local gcloud mode', () => {
  it('is refused in production', async () => {
    await expect(
      service({
        GCP_LOCAL_GCLOUD_AUTH: 'true',
        NODE_ENV: 'production',
      }).accessToken(),
    ).rejects.toThrow('local development only');
  });

  it('stays on Workload Identity Federation unless switched on', async () => {
    await expect(service({}).accessToken()).rejects.toThrow(
      'GCP_WIF_SERVICE_ACCOUNT is required',
    );
  });
});
