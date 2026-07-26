import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readSheet } from 'read-excel-file/node';
import { fromMillimes, toMillimes } from '../common/money';

export interface ParsedBankTransaction {
  transactionDate: string;
  valueDate: string | null;
  description: string;
  reference: string | null;
  amount: string;
  balance: string | null;
  fingerprint: string;
}

const aliases = {
  transactionDate: ['date', 'dateoperation', 'datedoperation', 'operationdate'],
  valueDate: ['datevaleur', 'valuedate'],
  description: ['libelle', 'description', 'wording', 'details', 'operation'],
  reference: ['reference', 'ref', 'piece'],
  amount: ['montant', 'amount'],
  debit: ['debit', 'montantdebit'],
  credit: ['credit', 'montantcredit'],
  balance: ['solde', 'balance'],
} as const;

export async function parseBankFile(
  file: Express.Multer.File,
): Promise<ParsedBankTransaction[]> {
  const extension = file.originalname.toLowerCase().split('.').pop();
  let rows: unknown[][];
  if (extension === 'xlsx') {
    rows = await readSheet(file.buffer);
  } else if (extension === 'csv') {
    rows = parseCsv(file.buffer.toString('utf8'));
  } else {
    throw new BadRequestException('Utilisez un fichier CSV ou XLSX.');
  }
  return parseRows(rows);
}

export function parseRows(rows: unknown[][]): ParsedBankTransaction[] {
  if (rows.length < 2)
    throw new BadRequestException('Le relevé ne contient aucune opération.');
  const headers = rows[0].map((cell) => normalizeHeader(stringValue(cell)));
  const index = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [
      key,
      headers.findIndex((header) => names.includes(header as never)),
    ]),
  ) as Record<keyof typeof aliases, number>;
  if (index.transactionDate < 0 || index.description < 0)
    throw new BadRequestException(
      'Le fichier doit contenir les colonnes Date et Libellé/Description.',
    );
  if (index.amount < 0 && index.debit < 0 && index.credit < 0)
    throw new BadRequestException(
      'Le fichier doit contenir Montant ou les colonnes Débit et Crédit.',
    );

  const parsed: ParsedBankTransaction[] = [];
  const occurrences = new Map<string, number>();
  const errors: string[] = [];
  rows.slice(1).forEach((row, offset) => {
    if (row.every((cell) => stringValue(cell) === '')) return;
    try {
      const transactionDate = parseDate(row[index.transactionDate]);
      const valueDate =
        index.valueDate >= 0 && stringValue(row[index.valueDate])
          ? parseDate(row[index.valueDate])
          : null;
      const description = stringValue(row[index.description]).slice(0, 500);
      if (!description) throw new Error('libellé vide');
      const reference =
        index.reference >= 0
          ? stringValue(row[index.reference]).slice(0, 150) || null
          : null;
      const amount = calculateAmount(row, index);
      if (toMillimes(amount) === 0n) throw new Error('montant nul');
      const balance =
        index.balance >= 0 && stringValue(row[index.balance])
          ? normalizeMoney(row[index.balance])
          : null;
      const base = [
        transactionDate,
        valueDate ?? '',
        amount,
        reference ?? '',
        normalizeHeader(description),
      ].join('|');
      const occurrence = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, occurrence);
      parsed.push({
        transactionDate,
        valueDate,
        description,
        reference,
        amount,
        balance,
        fingerprint: createHash('sha256')
          .update(`${base}|${occurrence}`)
          .digest('hex'),
      });
    } catch (error) {
      errors.push(
        `ligne ${offset + 2}: ${error instanceof Error ? error.message : 'valeur invalide'}`,
      );
    }
  });
  if (errors.length)
    throw new BadRequestException(
      `Le relevé contient des erreurs (${errors.slice(0, 10).join('; ')}).`,
    );
  if (!parsed.length)
    throw new BadRequestException('Le relevé ne contient aucune opération.');
  return parsed;
}

function calculateAmount(
  row: unknown[],
  index: Record<keyof typeof aliases, number>,
) {
  if (index.amount >= 0 && stringValue(row[index.amount]))
    return normalizeMoney(row[index.amount]);
  const debit =
    index.debit >= 0 && stringValue(row[index.debit])
      ? toMillimes(normalizeMoney(row[index.debit]))
      : 0n;
  const credit =
    index.credit >= 0 && stringValue(row[index.credit])
      ? toMillimes(normalizeMoney(row[index.credit]))
      : 0n;
  return fromMillimes(credit - debit);
}

function normalizeMoney(value: unknown): string {
  if (typeof value === 'number') return value.toFixed(3);
  let raw = stringValue(value)
    .replace(/[\s\u00a0']/g, '')
    .replace(/[^0-9.,()\-+]/g, '');
  const parenthesized = raw.startsWith('(') && raw.endsWith(')');
  raw = raw.replace(/[()]/g, '');
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    raw = raw.replace(decimal === ',' ? /\./g : /,/g, '');
    raw = raw.replace(decimal, '.');
  } else if (comma >= 0) {
    raw = raw.replace(',', '.');
  }
  if (parenthesized) raw = `-${raw}`;
  const millimes = toMillimes(raw, 'Montant importé');
  return fromMillimes(millimes);
}

function parseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return formatDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.round(value) * 86400000);
    return formatDate(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }
  const raw = stringValue(value);
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (iso) return formatDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw);
  if (local)
    return formatDate(Number(local[3]), Number(local[2]), Number(local[1]));
  throw new Error('date invalide');
}

function formatDate(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  )
    throw new Error('date invalide');
  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function stringValue(value: unknown) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value))
    return `${value as string | number | boolean | bigint}`.trim();
  return '';
}

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const separator = [';', ',', '\t'].sort(
    (a, b) => countSeparator(firstLine, b) - countSeparator(firstLine, a),
  )[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (char === '"') {
      if (quoted && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === separator && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function countSeparator(line: string, separator: string) {
  return line.split(separator).length - 1;
}
