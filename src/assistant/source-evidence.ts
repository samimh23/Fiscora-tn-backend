/** A chunk can span pages. Never invent a page when OCR mapping is absent/ambiguous. */
export function sourcePages(
  metadata: Record<string, unknown>,
  evidence: unknown,
  storedPage: number | null,
) {
  if (Number.isInteger(storedPage) && Number(storedPage) > 0)
    return [Number(storedPage)];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence))
    return [];
  const relevant = (path: string) => {
    switch (metadata.kind) {
      case 'IDENTITY':
        return ['document_number', 'issue_date'].includes(path);
      case 'PARTIES':
        return /^(supplier|customer)\./.test(path);
      case 'FINANCIAL_TOTALS':
        return Object.keys(metadata.financialValues ?? {}).includes(path);
      case 'BANK_ACCOUNT':
        return (
          path.startsWith('bank_statement.') &&
          !path.startsWith('bank_statement.transactions.')
        );
      case 'LINE_ITEMS': {
        const row = /^line_items\.(\d+)\./.exec(path);
        return (
          !!row &&
          Number(row[1]) + 1 >= Number(metadata.lineStart) &&
          Number(row[1]) + 1 <= Number(metadata.lineEnd)
        );
      }
      case 'BANK_TRANSACTIONS': {
        const row = /^bank_statement\.transactions\.(\d+)\./.exec(path);
        return (
          !!row &&
          Number(row[1]) + 1 >= Number(metadata.transactionStart) &&
          Number(row[1]) + 1 <= Number(metadata.transactionEnd)
        );
      }
      default:
        return false;
    }
  };
  return [
    ...new Set(
      Object.entries(evidence as Record<string, unknown>).flatMap(
        ([path, value]) => {
          if (!relevant(path) || !value || typeof value !== 'object') return [];
          const row = value as { status?: string; page?: unknown };
          return row.status === 'MATCHED' &&
            typeof row.page === 'number' &&
            Number.isInteger(row.page) &&
            row.page > 0
            ? [row.page]
            : [];
        },
      ),
    ),
  ].sort((a, b) => a - b);
}
