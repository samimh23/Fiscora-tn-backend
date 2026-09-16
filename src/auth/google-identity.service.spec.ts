import { UnauthorizedException } from '@nestjs/common';
import { validatedGoogleIdentity } from './google-identity.service';

describe('validatedGoogleIdentity', () => {
  it('accepts a verified Gmail identity', () => {
    expect(
      validatedGoogleIdentity({
        sub: 'google-subject',
        email: 'SamiMahjoub090@gmail.com',
        email_verified: true,
        name: 'Sami Mahjoub',
      }),
    ).toEqual({
      subject: 'google-subject',
      email: 'SamiMahjoub090@gmail.com',
      normalizedEmail: 'samimahjoub090@gmail.com',
      fullName: 'Sami Mahjoub',
      hostedDomain: null,
    });
  });

  it('accepts a verified Google Workspace identity', () => {
    expect(
      validatedGoogleIdentity({
        sub: 'workspace-subject',
        email: 'student@university.tn',
        email_verified: true,
        hd: 'university.tn',
      }),
    ).toMatchObject({
      normalizedEmail: 'student@university.tn',
      hostedDomain: 'university.tn',
    });
  });

  it('rejects an unverified identity', () => {
    expect(() =>
      validatedGoogleIdentity({
        sub: 'subject',
        email: 'user@gmail.com',
        email_verified: false,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a third-party address that Google is not authoritative for', () => {
    expect(() =>
      validatedGoogleIdentity({
        sub: 'subject',
        email: 'user@example.com',
        email_verified: true,
      }),
    ).toThrow(UnauthorizedException);
  });
});
