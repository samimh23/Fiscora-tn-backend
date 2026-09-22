import { ConfigService } from '@nestjs/config';
import { MfaService } from './mfa.service';

describe('MfaService', () => {
  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'MFA_ENCRYPTION_KEY') {
        return 'test-only-mfa-encryption-key-with-more-than-32-characters';
      }
      return fallback;
    },
  } as ConfigService;
  const service = new MfaService(config);

  it('encrypts secrets with authenticated encryption', () => {
    const encrypted = service.encryptSecret('JBSWY3DPEHPK3PXP');

    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(service.decryptSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('validates an RFC 6238 code and returns its time step', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    expect(service.findMatchingTotpStep(secret, '287082', 59_000)).toBe(1);
  });

  it('normalizes and hashes recovery codes consistently', () => {
    const hash = service.hashRecoveryCode('ABCD-EF12-3456-7890');

    expect(service.isRecoveryCode('abcd ef12 3456 7890')).toBe(true);
    expect(service.hashRecoveryCode('abcd ef12 3456 7890')).toBe(hash);
  });
});
