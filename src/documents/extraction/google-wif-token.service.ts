import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ManagedIdentityCredential } from '@azure/identity';

@Injectable()
export class GoogleWifTokenService {
  private readonly credential: ManagedIdentityCredential;
  private cached: { token: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: ConfigService) {
    const clientId = this.config.get<string>('AZURE_CLIENT_ID')?.trim();
    this.credential = clientId
      ? new ManagedIdentityCredential(clientId)
      : new ManagedIdentityCredential();
  }

  async identityToken(targetAudience: string): Promise<string> {
    if (this.cached && this.cached.expiresAtMs - Date.now() > 120_000) {
      return this.cached.token;
    }
    const appIdUri = this.required('AZURE_GCP_WIF_APP_ID_URI');
    const providerAudience = this.required('GCP_WIF_PROVIDER_AUDIENCE');
    const serviceAccount = this.required('GCP_WIF_SERVICE_ACCOUNT');
    const azureToken = await this.credential.getToken(`${appIdUri}/.default`);
    if (!azureToken?.token)
      throw new Error('Azure managed identity did not return a token.');

    const sts = await this.requestJson<{ access_token?: string }>(
      'https://sts.googleapis.com/v1/token',
      {
        audience: providerAudience,
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        subject_token: azureToken.token,
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      },
    );
    if (!sts.access_token)
      throw new Error('Google STS did not return an access token.');

    const generated = await this.requestJson<{ token?: string }>(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateIdToken`,
      { audience: targetAudience, includeEmail: true },
      sts.access_token,
    );
    if (!generated.token)
      throw new Error('Google IAM did not return an identity token.');
    this.cached = {
      token: generated.token,
      expiresAtMs: this.jwtExpiry(generated.token) ?? Date.now() + 45 * 60_000,
    };
    return generated.token;
  }

  private async requestJson<T>(
    url: string,
    body: unknown,
    bearer?: string,
  ): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(
        `Federated authentication failed (${response.status}): ${detail}`,
      );
    }
    return (await response.json()) as T;
  }

  private jwtExpiry(token: string) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
      ) as { exp?: number };
      return payload.exp ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value)
      throw new Error(
        `${name} is required when document extraction is enabled.`,
      );
    return value;
  }
}
