import { BadRequestException } from '@nestjs/common';

export function toMillimes(value: string, field = 'montant'): bigint {
  if (!/^-?\d+(\.\d{1,3})?$/.test(value)) {
    throw new BadRequestException(
      `${field} doit être un nombre avec au maximum trois décimales.`,
    );
  }
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const amount = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return negative ? -amount : amount;
}

export function fromMillimes(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 1000n}.${(absolute % 1000n)
    .toString()
    .padStart(3, '0')}`;
}

export function multiplyRate(amount: bigint, rate: string): bigint {
  if (!/^\d+(\.\d{1,5})?$/.test(rate)) {
    throw new BadRequestException(
      'Le taux doit être positif avec au maximum cinq décimales.',
    );
  }
  const [whole, fraction = ''] = rate.split('.');
  const scaledRate = BigInt(whole) * 100000n + BigInt(fraction.padEnd(5, '0'));
  return (amount * scaledRate + 50000n) / 100000n;
}
