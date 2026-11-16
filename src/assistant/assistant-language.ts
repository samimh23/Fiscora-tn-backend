/**
 * The assistant answers in the language of the question. Gemini ignored a
 * general "answer in the user's language" rule (the system prompt is French),
 * so the language is detected here and stated explicitly in each request.
 */
export type AnswerLanguage = 'fr' | 'en' | 'ar';

const ENGLISH = new Set(
  `the a an what which who whom whose how is are was were do does did we our us
  you your have has had much many this that these those for of to from in on with
  and or buy bought cost costs price invoice invoices supplier suppliers customer
  customers client clients show list give tell me any all total amount date when
  where why can could should would will there their it its vat paid pay`.split(
    /\s+/,
  ),
);
const FRENCH = new Set(
  `le la les un une des du de d l est sont quel quelle quels quelles qui que quoi
  comment combien pourquoi quand ou nous notre nos vous votre avons avez ont a
  ce cet cette ces pour par sur dans avec et facture factures fournisseur
  fournisseurs client clients montant total date liste donne moi y il elle son sa
  ses leur leurs tva achat achats vente ventes payé paye prix`.split(/\s+/),
);

export function detectQuestionLanguage(question: string): AnswerLanguage {
  const letters = question.replace(/[\s\d\p{P}\p{S}]/gu, '');
  const arabic = (question.match(/\p{Script=Arabic}/gu) ?? []).length;
  if (letters.length && arabic / letters.length > 0.3) return 'ar';
  const words =
    question
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[a-z]+/g) ?? [];
  let english = 0;
  let french = 0;
  for (const word of words) {
    if (ENGLISH.has(word)) english += 1;
    if (FRENCH.has(word)) french += 1;
  }
  // French accents are a strong signal on their own.
  if (/[éèêàùçôîû]/i.test(question)) french += 2;
  return english > french ? 'en' : 'fr';
}

const LANGUAGE_NAME: Record<AnswerLanguage, string> = {
  fr: 'français',
  en: 'anglais (English)',
  ar: 'arabe (العربية)',
};

/** Appended to the model request: the answer language is not optional. */
export function answerLanguageRule(language: AnswerLanguage) {
  return `\n\nLangue de la réponse : ${LANGUAGE_NAME[language]}. Rédigez toute la réponse dans cette langue, y compris le rappel sur la validation humaine. Gardez les montants, dates, numéros et noms exactement comme dans les sources.`;
}

type Messages = {
  humanReview: string;
  noIndexedSource: string;
  lowConfidence: string;
  amountWarning: (amounts: string) => string;
  listing: {
    documents: (count: number, what: string, period: string) => string;
    parties: (
      count: number,
      party: 'SUPPLIER' | 'CUSTOMER',
      side: 'purchase' | 'sale',
      period: string,
    ) => string;
    pieces: (count: number) => string;
    partiesNote: string;
    more: (count: number) => string;
    kinds: Record<string, string>;
    anyKind: string;
    months: string[];
    inPeriod: (month: string | null, year: number | null) => string;
  };
  fileNotFound: (name: string, available: string) => string;
  ranking: (
    party: 'SUPPLIER' | 'CUSTOMER',
    count: number,
    period: string,
  ) => string;
  partyTotal: (
    name: string,
    side: 'purchase' | 'sale',
    period: string,
    count: number,
  ) => string;
  totalsLine: (ttc: string, ht: string | null, tax: string | null) => string;
  totalsNote: string;
};

const FR_MONTHS = [
  '',
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const EN_MONTHS = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const AR_MONTHS = [
  '',
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export const MESSAGES: Record<AnswerLanguage, Messages> = {
  fr: {
    humanReview:
      'Une validation humaine reste nécessaire pour toute décision comptable ou fiscale.',
    noIndexedSource: 'Aucune source validée n’est indexée pour ce dossier.',
    lowConfidence:
      'Les sources validées ne permettent pas de répondre avec suffisamment de confiance.',
    amountWarning: (amounts) =>
      `⚠️ Montant(s) non retrouvé(s) tel(s) quel(s) dans les sources : ${amounts}. Il peut s’agir d’un calcul de l’assistant : vérifiez sur la pièce avant tout usage.`,
    listing: {
      documents: (count, what, period) =>
        `${count} ${what} validée(s)${period} :`,
      parties: (count, party, side, period) => {
        const label = party === 'SUPPLIER' ? 'fournisseur' : 'client';
        const plural = count > 1 ? 's' : '';
        const kind = side === 'purchase' ? 'd’achat' : 'de vente';
        return `Les pièces ${kind} validées du dossier${period} mentionnent ${count} ${label}${plural} distinct${plural} :`;
      },
      pieces: (count) => `${count} pièce${count > 1 ? 's' : ''}`,
      partiesNote:
        'Ce décompte porte sur les pièces validées, pas sur le fichier des tiers.',
      more: (count) => `… et ${count} autre(s).`,
      kinds: {
        FACTURES_ACHATS: 'pièce(s) d’achat',
        FACTURES_VENTES: 'pièce(s) de vente',
        RELEVES_BANCAIRES: 'relevé(s) bancaire(s)',
      },
      anyKind: 'pièce(s)',
      months: FR_MONTHS,
      inPeriod: (month, year) =>
        month && year
          ? ` en ${month} ${year}`
          : month
            ? ` en ${month}`
            : year
              ? ` en ${year}`
              : '',
    },
    ranking: (party, count, period) =>
      `${party === 'SUPPLIER' ? 'Fournisseurs' : 'Clients'} classés par total TTC des pièces validées${period} (${count}) :`,
    partyTotal: (name, side, period, count) =>
      `Total des ${side === 'purchase' ? 'achats chez' : 'ventes à'} ${name}${period} — ${count} pièce${count > 1 ? 's' : ''} validée${count > 1 ? 's' : ''} :`,
    totalsLine: (ttc, ht, tax) =>
      `Total : ${ttc} TTC${ht ? ` · ${ht} HT` : ''}${tax ? ` · TVA ${tax}` : ''}`,
    totalsNote:
      'Calcul exact sur les pièces validées (avoirs déduits), pas sur les écritures comptables.',
    fileNotFound: (name, available) =>
      `Aucun document nommé « ${name} » n’est validé dans ce dossier.${available ? ` Documents validés : ${available}.` : ''}`,
  },
  en: {
    humanReview:
      'A human review is still required for any accounting or tax decision.',
    noIndexedSource: 'No validated source is indexed for this client file.',
    lowConfidence:
      'The validated sources do not allow a sufficiently reliable answer.',
    amountWarning: (amounts) =>
      `⚠️ Amount(s) not found as such in the sources: ${amounts}. It may be a calculation by the assistant: check the document before using it.`,
    listing: {
      documents: (count, what, period) =>
        `${count} validated ${what}${period}:`,
      parties: (count, party, side, period) => {
        const label =
          party === 'SUPPLIER'
            ? count > 1
              ? 'suppliers'
              : 'supplier'
            : count > 1
              ? 'customers'
              : 'customer';
        const kind = side === 'purchase' ? 'purchase' : 'sales';
        return `The validated ${kind} documents of this client file${period} mention ${count} distinct ${label}:`;
      },
      pieces: (count) => `${count} document${count > 1 ? 's' : ''}`,
      partiesNote:
        'This count covers validated documents, not the third-party register.',
      more: (count) => `… and ${count} more.`,
      kinds: {
        FACTURES_ACHATS: 'purchase document(s)',
        FACTURES_VENTES: 'sales document(s)',
        RELEVES_BANCAIRES: 'bank statement(s)',
      },
      anyKind: 'document(s)',
      months: EN_MONTHS,
      inPeriod: (month, year) =>
        month && year
          ? ` in ${month} ${year}`
          : month
            ? ` in ${month}`
            : year
              ? ` in ${year}`
              : '',
    },
    ranking: (party, count, period) =>
      `${party === 'SUPPLIER' ? 'Suppliers' : 'Customers'} ranked by total incl. tax of validated documents${period} (${count}):`,
    partyTotal: (name, side, period, count) =>
      `Total ${side === 'purchase' ? 'purchases from' : 'sales to'} ${name}${period} — ${count} validated document${count > 1 ? 's' : ''}:`,
    totalsLine: (ttc, ht, tax) =>
      `Total: ${ttc} incl. tax${ht ? ` · ${ht} excl. tax` : ''}${tax ? ` · VAT ${tax}` : ''}`,
    totalsNote:
      'Exact calculation on validated documents (credit notes deducted), not on accounting entries.',
    fileNotFound: (name, available) =>
      `No validated document named "${name}" in this client file.${available ? ` Validated documents: ${available}.` : ''}`,
  },
  ar: {
    humanReview: 'يبقى التحقق البشري ضرورياً لأي قرار محاسبي أو جبائي.',
    noIndexedSource: 'لا توجد أي وثيقة مصادق عليها مفهرسة في هذا الملف.',
    lowConfidence: 'لا تسمح الوثائق المصادق عليها بإجابة موثوقة بما يكفي.',
    amountWarning: (amounts) =>
      `⚠️ مبلغ غير موجود كما هو في المصادر: ${amounts}. قد يكون حساباً قام به المساعد: تحقق من الوثيقة قبل استعماله.`,
    listing: {
      documents: (count, what, period) =>
        `${count} ${what} مصادق عليها${period}:`,
      parties: (count, party, side, period) => {
        const label = party === 'SUPPLIER' ? 'مزودين' : 'حرفاء';
        const kind = side === 'purchase' ? 'الشراءات' : 'المبيعات';
        return `تذكر وثائق ${kind} المصادق عليها في الملف${period} ${count} ${label} مختلفين:`;
      },
      pieces: (count) => `${count} وثيقة`,
      partiesNote: 'يشمل هذا العدّ الوثائق المصادق عليها وليس سجل الأطراف.',
      more: (count) => `… و${count} أخرى.`,
      kinds: {
        FACTURES_ACHATS: 'وثيقة شراء',
        FACTURES_VENTES: 'وثيقة بيع',
        RELEVES_BANCAIRES: 'كشف بنكي',
      },
      anyKind: 'وثيقة',
      months: AR_MONTHS,
      inPeriod: (month, year) =>
        month && year
          ? ` في ${month} ${year}`
          : month
            ? ` في ${month}`
            : year
              ? ` في ${year}`
              : '',
    },
    ranking: (party, count, period) =>
      `${party === 'SUPPLIER' ? 'المزودون' : 'الحرفاء'} مرتبون حسب المجموع باعتبار الأداءات للوثائق المصادق عليها${period} (${count}):`,
    partyTotal: (name, side, period, count) =>
      `مجموع ${side === 'purchase' ? 'الشراءات من' : 'المبيعات إلى'} ${name}${period} — ${count} وثيقة مصادق عليها:`,
    totalsLine: (ttc, ht, tax) =>
      `المجموع: ${ttc} باعتبار الأداءات${ht ? ` · ${ht} دون اعتبار الأداءات` : ''}${tax ? ` · الأداء على القيمة المضافة ${tax}` : ''}`,
    totalsNote:
      'حساب دقيق على الوثائق المصادق عليها (مع طرح الفواتير التعديلية)، وليس على القيود المحاسبية.',
    fileNotFound: (name, available) =>
      `لا توجد وثيقة مصادق عليها باسم « ${name} » في هذا الملف.${available ? ` الوثائق المصادق عليها: ${available}.` : ''}`,
  },
};
