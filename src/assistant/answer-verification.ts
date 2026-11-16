import { MESSAGES, type AnswerLanguage } from './assistant-language';

/**
 * Checks that every amount in a generated answer appears in the sources the
 * model was given. An amount that is not there was either invented or
 * calculated by the model; both must be visible to the accountant.
 */

/** "1 190,500" → "1190.500"; keeps digits comparable across formats. */
function canonical(text: string) {
  return text
    .replace(/(\d)[^\S\n](?=\d{3}(?!\d))/g, '$1')
    .replace(/(\d),(\d{1,3})(?!\d)/g, '$1.$2');
}

/** 120.500 ≡ 120.5 and 120.000 ≡ 120. */
function value(token: string) {
  return Number(token);
}

function amounts(text: string) {
  const found: Array<{ raw: string; value: number }> = [];
  // Amounts: a decimal part, or 4+ digits that are not a year.
  for (const match of canonical(text).matchAll(
    /(?<![\w./-])(\d+(?:\.\d+)?)(?![\w/-]|\.\d)/g,
  )) {
    const raw = match[1];
    const isDecimal = raw.includes('.');
    if (!isDecimal && (raw.length < 4 || /^(19|20)\d{2}$/.test(raw))) continue;
    found.push({ raw, value: value(raw) });
  }
  return found;
}

export function unsupportedAmounts(answer: string, sources: string) {
  // Citation labels and dates are not amounts.
  const cleaned = answer
    .replace(/\[S\d+\]/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ');
  const known = new Set(amounts(sources).map((item) => item.value));
  return [
    ...new Set(
      amounts(cleaned)
        .filter((item) => !known.has(item.value))
        .map((item) => item.raw),
    ),
  ];
}

export function amountWarning(
  unsupported: string[],
  language: AnswerLanguage = 'fr',
) {
  if (!unsupported.length) return '';
  if (language === 'fr') {
    const plural = unsupported.length > 1 ? 's' : '';
    return `\n\n⚠️ Montant${plural} non retrouvé${plural} tel${plural} quel${plural} dans les sources : ${unsupported.slice(0, 5).join(', ')}. Il peut s’agir d’un calcul de l’assistant : vérifiez sur la pièce avant tout usage.`;
  }
  return `\n\n${MESSAGES[language].amountWarning(unsupported.slice(0, 5).join(', '))}`;
}

/**
 * The app links "[S1] [S2]"; models sometimes write "[S1, S2]", "[S1; S2]"
 * or "[S1-S2]". Rewrites them so every source stays clickable.
 */
export function normalizeCitations(answer: string) {
  return answer.replace(
    /\[\s*(S\d+(?:(?:\s*[,;/&-]\s*|\s+(?:et|and)\s+)S?\d+)+)\s*\]/g,
    (_, inner: string) =>
      inner
        .split(/\s*[,;/&]\s*|\s+(?:et|and)\s+/)
        .flatMap((part) => {
          const range = /^S?(\d+)\s*-\s*S?(\d+)$/.exec(part);
          if (!range) return [`[S${part.replace(/^S/, '')}]`];
          const [start, end] = [Number(range[1]), Number(range[2])];
          return end >= start && end - start < 20
            ? Array.from(
                { length: end - start + 1 },
                (_, i) => `[S${start + i}]`,
              )
            : [`[S${start}]`, `[S${end}]`];
        })
        .join(' '),
  );
}
