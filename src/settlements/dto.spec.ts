import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateThirdPartyPaymentDraftDto } from './dto';

describe('UpdateThirdPartyPaymentDraftDto', () => {
  it('accepts an ISO calendar date and reference', async () => {
    const dto = plainToInstance(UpdateThirdPartyPaymentDraftDto, {
      paymentDate: '2026-09-18',
      reference: 'DEC-SEP-001',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    '09/18/2026',
    '18/09/2026',
    '2026-02-31',
    '2026-09-18T00:00:00Z',
    '',
  ])('rejects invalid or ambiguous date %s', async (paymentDate) => {
    const dto = plainToInstance(UpdateThirdPartyPaymentDraftDto, {
      paymentDate,
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'paymentDate'),
    ).toBe(true);
  });
});
