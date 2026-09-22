import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import * as QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

@Injectable()
export class MfaService {
  constructor(private readonly config: ConfigService) {}

  generateSecret(): string {
    return this.encodeBase32(randomBytes(20));
  }

  buildOtpAuthUri(email: string, secret: string): string {
    const issuer = this.config.get<string>('MFA_ISSUER', 'Fiscora');
    const label = `${issuer}:${email}`;
    const query = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(TOTP_DIGITS),
      period: String(TOTP_PERIOD_SECONDS),
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
  }

  async toQrCodeDataUrl(uri: string): Promise<string> {
    return QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
    });
  }

  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return ['v1', iv, tag, encrypted]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  decryptSecret(value: string): string {
    const [version, ivValue, tagValue, encryptedValue] = value.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
      throw new InternalServerErrorException(
        'La configuration MFA enregistrée est invalide.',
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Impossible de déchiffrer la configuration MFA.',
      );
    }
  }

  findMatchingTotpStep(
    secret: string,
    input: string,
    now = Date.now(),
  ): number | null {
    const code = input.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return null;

    const currentStep = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
    for (const offset of [0, -1, 1]) {
      const step = currentStep + offset;
      if (this.safeEqual(code, this.totpForStep(secret, step))) return step;
    }
    return null;
  }

  generateRecoveryCodes(count = 10): string[] {
    return Array.from({ length: count }, () => {
      const raw = randomBytes(8).toString('hex').toUpperCase();
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
    });
  }

  hashRecoveryCode(code: string): string {
    return createHash('sha256')
      .update(this.normalizeRecoveryCode(code))
      .digest('hex');
  }

  isRecoveryCode(input: string): boolean {
    return /^[A-F0-9]{16}$/.test(this.normalizeRecoveryCode(input));
  }

  private totpForStep(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac('sha1', this.decodeBase32(secret))
      .update(counter)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
  }

  private encryptionKey(): Buffer {
    const value = this.config.get<string>('MFA_ENCRYPTION_KEY')?.trim();
    if (!value || value.length < 32) {
      throw new InternalServerErrorException(
        'MFA_ENCRYPTION_KEY doit contenir au moins 32 caractères.',
      );
    }
    return createHash('sha256').update(value, 'utf8').digest();
  }

  private normalizeRecoveryCode(code: string): string {
    return code.toUpperCase().replace(/[^A-F0-9]/g, '');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private encodeBase32(input: Buffer): string {
    let bits = '';
    for (const byte of input) bits += byte.toString(2).padStart(8, '0');
    let result = '';
    for (let index = 0; index < bits.length; index += 5) {
      result +=
        BASE32_ALPHABET[
          parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)
        ];
    }
    return result;
  }

  private decodeBase32(value: string): Buffer {
    let bits = '';
    for (const character of value.toUpperCase().replace(/=+$/g, '')) {
      const index = BASE32_ALPHABET.indexOf(character);
      if (index < 0) throw new Error('Invalid base32 value');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }
}
