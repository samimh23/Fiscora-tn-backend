import { BadRequestException } from '@nestjs/common';
import { readSheet } from 'read-excel-file/node';

export interface MigrationRow {
  rowNumber: number;
  values: Record<string, string>;
}

export async function parseMigrationFile(
  file?: Express.Multer.File,
): Promise<MigrationRow[]> {
  if (!file) throw new BadRequestException('Le fichier de migration est requis.');
  const extension = file.originalname.toLowerCase().split('.').pop();
  let rows: unknown[][];
  if (extension === 'xlsx') rows = await readSheet(file.buffer);
  else if (extension === 'csv') rows = parseCsv(file.buffer.toString('utf8'));
  else throw new BadRequestException('Utilisez un fichier CSV ou XLSX exporté depuis Sage/Ciel.');
  if (rows.length < 2)
    throw new BadRequestException('Le fichier ne contient aucune ligne à importer.');
  const headers = rows[0].map((cell) => normalizeHeader(stringValue(cell)));
  const parsed = rows
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map((header, cellIndex) => [header, stringValue(row[cellIndex])]),
      ),
    }))
    .filter((row) => Object.values(row.values).some(Boolean));
  if (!parsed.length)
    throw new BadRequestException('Le fichier ne contient aucune ligne à importer.');
  return parsed;
}

export function pick(row: MigrationRow, aliases: string[]) {
  for (const alias of aliases.map(normalizeHeader)) {
    const value = row.values[alias];
    if (value) return value.trim();
  }
  return '';
}

export function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function stringValue(value: unknown) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
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
