import { BadRequestException } from '@nestjs/common';
import { fromMillimes, toMillimes } from '../common/money';

const RATE_SCALE = 100_000_000n;

export function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new BadRequestException('La devise doit Ãªtre un code ISO de 3 lettres.');
  return currency;
}

export function parseExchangeRate(value: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(value))
    throw new BadRequestException(
      'Le taux de change doit Ãªtre positif avec au maximum huit dÃ©cimales.',
    );
  const [whole, fraction = ''] = value.split('.');
  const rate = BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(8, '0'));
  if (rate <= 0n) throw new BadRequestException('Le taux de change doit Ãªtre positif.');
  return rate;
}

export function convertForeignToTnd(amount: string, rate: string) {
  const foreignMillimes = toMillimes(amount, 'Montant en devise');
  const scaledRate = parseExchangeRate(rate);
  return fromMillimes((foreignMillimes * scaledRate + RATE_SCALE / 2n) / RATE_SCALE);
}
