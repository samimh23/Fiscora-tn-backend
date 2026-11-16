/**
 * Users name documents by their file name ("test 1", "test5.png",
 * "facture-mytek.pdf"). Without this, the search treated "test 1" as text and
 * the model guessed which document was meant.
 */
export interface NamedDocument {
  id: string;
  original_name: string;
}

export interface NameReference {
  /** Documents the question names; exactly one means "read this document". */
  matches: NamedDocument[];
  /** What the user typed when it looks like a file name that matched nothing. */
  missing: string | null;
}

function plain(value: string) {
  return value
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase();
}

const EXTENSION = /\.(pdf|png|jpe?g|webp|tiff?|heic|gif|bmp)$/i;

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "test5" → /test[\s_.-]*5/, so "test 5", "test_5" and "test5" all match. */
function stemPattern(stem: string) {
  const parts = stem.match(/[a-z]+|\d+/g) ?? [];
  if (!parts.length) return null;
  return new RegExp(
    `(?<![a-z0-9])${parts.map(escape).join('[\\s_.\\-]*')}(?![a-z0-9])`,
  );
}

export function findNamedDocuments(
  question: string,
  documents: NamedDocument[],
): NameReference {
  const text = plain(question);
  const matches = documents.filter((document) => {
    const name = plain(document.original_name.trim());
    if (name.length >= 3 && text.includes(name)) return true;
    const stem = name.replace(EXTENSION, '');
    // A stem without digits ("facture", "scan") is too common to be a name.
    if (stem.length < 3 || !/\d/.test(stem) || !/[a-z]/.test(stem)) {
      return false;
    }
    return stemPattern(stem)?.test(text) ?? false;
  });
  if (matches.length) return { matches, missing: null };

  // A token with a file extension is certainly a file name.
  const withExtension = text.match(
    /[a-z0-9][\w.-]*\.(pdf|png|jpe?g|webp|tiff?|heic|gif|bmp)\b/,
  );
  if (withExtension) return { matches, missing: withExtension[0] };

  // "test 1" when the dossier holds test2.jpg and test5.png follows the same
  // naming scheme: the user means a file that is not there.
  const prefixes = new Set(
    documents
      .map((document) =>
        /^([a-z]{2,15})[\s_.-]*\d/.exec(
          plain(document.original_name).replace(EXTENSION, ''),
        ),
      )
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => match[1]),
  );
  for (const prefix of prefixes) {
    const mention = new RegExp(
      `(?<![a-z0-9])${escape(prefix)}[\\s_.-]*\\d{1,6}(?![a-z0-9])`,
    ).exec(text);
    if (mention) return { matches, missing: mention[0] };
  }
  return { matches, missing: null };
}

/** Cheap check before loading document names for every question. */
export function mayNameADocument(question: string) {
  // "test 1", "scan5", "img_12" (not years or invoice numbers), or "x.pdf".
  return (
    /\p{L}[\s_-]?\d{1,3}(?!\d)/u.test(question) ||
    /\.(pdf|png|jpe?g|webp|tiff?|heic|gif|bmp)\b/i.test(question)
  );
}
