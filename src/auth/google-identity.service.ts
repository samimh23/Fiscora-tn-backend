import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  normalizedEmail: string;
  fullName: string | null;
  hostedDomain: string | null;
}

export function validatedGoogleIdentity(
  payload: TokenPayload | undefined,
): VerifiedGoogleIdentity {
  const email = payload?.email?.trim();
  const subject = payload?.sub?.trim();
  if (!payload || !subject || !email || payload.email_verified !== true) {
    throw new UnauthorizedException(
      'Google n’a pas pu confirmer cette adresse e-mail.',
    );
  }

  // Keep the same canonical form as AuthService and the users table so a
  // Google-created account can later use password reset/local authentication.
  const normalizedEmail = email.toUpperCase();
  const hostedDomain = payload.hd?.trim().toLowerCase() || null;
  const isAuthoritativeGoogleAddress =
    normalizedEmail.endsWith('@GMAIL.COM') || Boolean(hostedDomain);
  if (!isAuthoritativeGoogleAddress) {
    throw new UnauthorizedException(
      'Utilisez une adresse Gmail ou Google Workspace pour la première association.',
    );
  }

  return {
    subject,
    email,
    normalizedEmail,
    fullName: payload.name?.trim() || null,
    hostedDomain,
  };
}

@Injectable()
export class GoogleIdentityService {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async verify(credential: string): Promise<VerifiedGoogleIdentity> {
    const clientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException(
        'La connexion Google n’est pas encore configurée.',
      );
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      return validatedGoogleIdentity(ticket.getPayload());
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(
        'La preuve de connexion Google est invalide ou expirée.',
      );
    }
  }
}
