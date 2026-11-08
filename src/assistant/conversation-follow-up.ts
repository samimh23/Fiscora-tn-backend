interface PreviousSource {
  label?: string;
  sourceId: string;
  sourceName: string;
  kind?: string;
  chunkId: string;
}

export interface PreviousAssistantTurn {
  question: string;
  answer?: string;
  citations: PreviousSource[] | null;
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reference =
  /\b(?:invoice|facture)\s+(?:n[°o]?\s*)?((?=[a-z0-9./_-]*\d)[a-z0-9][a-z0-9./_-]*)\b/gi;

function invoiceReferences(text: string) {
  return [...new Set([...text.matchAll(reference)].map((match) => match[1]))];
}

export function isEntityFollowUp(question: string) {
  const text = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (
    /\b(its|this invoice|that invoice|this document|that document|same invoice|cette facture|ce document|son solde|sa tva|ses paiements|son paiement|celle-ci|celui-ci)\b/.test(
      text,
    ) || /^(and\b|what about\b|et\b)/.test(text)
  );
}

/** Resolve references, never financial facts, from the last server-scoped turn. */
export function resolveFollowUp(
  question: string,
  previous?: PreviousAssistantTurn,
) {
  if (!isEntityFollowUp(question) || [...question.matchAll(reference)].length) {
    return { question };
  }
  const usedLabels = new Set(
    [...(previous?.answer ?? '').matchAll(/\[(S\d+)\]/g)].map(
      (match) => match[1],
    ),
  );
  const sources = (previous?.citations ?? []).filter(
    (source) =>
      !usedLabels.size || (source.label && usedLabels.has(source.label)),
  );
  const documents = new Map(
    sources
      .filter(
        (source) =>
          (source.kind === 'DOCUMENT' ||
            (!source.kind && uuid.test(source.chunkId))) &&
          uuid.test(source.sourceId),
      )
      .map((source) => [source.sourceId, source]),
  );
  const invoices = new Map(
    sources
      .filter((source) => source.kind === 'BUSINESS_INVOICE')
      .map((source) => [source.sourceId, source]),
  );
  // Canonical source names come from current business records. This also keeps
  // a second follow-up working when the preceding user question was a pronoun.
  const references =
    invoices.size === 1
      ? invoiceReferences([...invoices.values()][0].sourceName)
      : [];
  const resolvedReferences = references.length
    ? references
    : invoiceReferences(previous?.question ?? '');
  if (
    invoices.size === 1 &&
    resolvedReferences.length === 1 &&
    documents.size === 0
  ) {
    return {
      question: `Concernant la facture ${resolvedReferences[0]} : ${question}`,
      invoiceNumber: resolvedReferences[0],
    };
  }
  if (documents.size === 1 && invoices.size === 0) {
    const source = [...documents.values()][0];
    return {
      question: `${question}\nDocument concerné : ${source.sourceName.slice(0, 200)}`,
      sourceId: source.sourceId,
    };
  }
  return {
    question,
    clarification:
      'De quelle facture ou de quel document parlez-vous ? Indiquez sa référence ou son nom pour éviter de consulter la mauvaise pièce.',
  };
}
