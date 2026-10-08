import { createHash } from 'node:crypto';

export const TRAINING_SCHEMA_VERSION = 'fiscora-nuextract-v1';

// Keep only extraction fields, never OCR evidence, bookkeeping IDs or computed metadata.
export function projectTrainingAnswer(
  value: unknown,
  template: unknown,
): unknown {
  if (Array.isArray(template)) {
    if (template.length === 1 && typeof template[0] === 'object') {
      return Array.isArray(value)
        ? value.map((item) => projectTrainingAnswer(item, template[0]))
        : [];
    }
    if (template.every((item) => typeof item === 'string')) {
      return typeof value === 'string' && template.includes(value)
        ? value
        : null;
    }
    return [];
  }
  if (template && typeof template === 'object') {
    const source =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(template).map(([key, child]) => [
        key,
        projectTrainingAnswer(source[key], child),
      ]),
    );
  }
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? value
    : null;
}

export function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}
