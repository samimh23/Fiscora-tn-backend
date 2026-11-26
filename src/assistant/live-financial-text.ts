import type { AnswerLanguage } from './assistant-language';

/**
 * Texts of the read-only accounting answers, in the language of the question.
 * Amounts, numbers, dates and status codes stay exactly as recorded.
 */
export interface LiveFinancialText {
  forbidden: string;
  unsupportedPeriod: string;
  unknownRequest: string;
  severalParties: (list: string) => string;
  noParty: (name: string) => string;
  notProvided: string;
  taxId: string;
  partyBalances: (name: string) => string;
  allBalances: string;
  invoice: (number: string) => string;
  creditNote: (number: string) => string;
  payment: (reference: string) => string;
  statements: (year: number) => string;
  balancesHeader: (party: string | null, at: string, source: string) => string;
  supplierLine: (due: string, refund: string, source: string) => string;
  customerLine: (due: string, refund: string, source: string) => string;
  balancesNote: string;
  partyScope: string;
  balanceRow: (
    number: string,
    party: string,
    type: string,
    outstanding: string,
    due: string,
    citation: string,
  ) => string;
  moreInvoices: (total: string, source: string) => string;
  askReference: string;
  oneReference: string;
  noInvoice: string;
  severalInvoices: string;
  invoiceDates: (
    date: string,
    due: string,
    net: string,
    vat: string,
    gross: string,
    payable: string,
    source: string,
  ) => string;
  invoiceSettlement: (
    paid: string,
    credited: string,
    outstanding: string,
    source: string,
  ) => string;
  invoiceNote: string;
  notPosted: string;
  creditLine: (
    number: string,
    amount: string,
    status: string,
    citation: string,
  ) => string;
  noPayment: (source: string) => string;
  historyLimited: string;
  paymentLine: (
    reference: string,
    date: string,
    direction: string,
    method: string,
    status: string,
    amount: string,
    allocated: string | undefined,
    instrument: string | null,
    correction: { type: string; date: string; reason: string } | null,
    citation: string,
  ) => string;
  severalPayments: string;
  noPaymentReference: string;
  paymentNote: string;
  allocationLine: (
    number: string,
    allocated: string,
    outstanding: string,
    citation: string,
  ) => string;
  allocationsLimited: string;
  askYear: string;
  summaryHeader: (
    name: string,
    year: number,
    start: string,
    end: string,
    source: string,
  ) => string;
  summaryFinal: (version: string, at: string) => string;
  summaryLive: (at: string) => string;
  summarySource: (origin: string, source: string) => string;
  results: (
    operating: string,
    beforeTax: string,
    net: string,
    currency: string,
    source: string,
  ) => string;
  balanceSheet: (
    assets: string,
    liabilities: string,
    currency: string,
    source: string,
  ) => string;
  cash: (
    closing: string,
    variation: string,
    currency: string,
    source: string,
  ) => string;
  incomeLines: string;
  control: (label: string, message: string, source: string) => string;
  mappings: (count: number, source: string) => string;
  summaryNote: string;
}

const FR: LiveFinancialText = {
  forbidden:
    'Vous n’avez pas les permissions nécessaires pour consulter ces données financières.',
  unsupportedPeriod:
    'Les soldes et paiements sont consultés dans leur état actuel. Le résumé financier couvre un exercice annuel. Précisez un solde actuel ou une année de résumé; les soldes historiques et résumés mensuels ne sont pas disponibles ici.',
  unknownRequest:
    'Précisez un tiers, une facture, un règlement ou une année de résumé financier.',
  severalParties: (list) =>
    `Plusieurs tiers correspondent. Précisez le nom complet et le type client/fournisseur : ${list}.`,
  noParty: (name) =>
    `Aucun tiers ou nom de facture comptabilisée ne correspond à « ${name} » dans ce dossier. Vérifiez le nom; cela ne signifie pas que le solde est nul.`,
  notProvided: 'non renseigné',
  taxId: 'MF',
  partyBalances: (name) => `Soldes de ${name}`,
  allBalances: 'Soldes clients et fournisseurs',
  invoice: (number) => `Facture ${number}`,
  creditNote: (number) => `Avoir ${number}`,
  payment: (reference) => `Règlement ${reference}`,
  statements: (year) => `États financiers ${year}`,
  balancesHeader: (party, at, source) =>
    `Soldes actuels${party ? ` de « ${party} »` : ' du dossier'}, au ${at}. Factures comptabilisées uniquement; montants comptables en TND. ${source}`,
  supplierLine: (due, refund, source) =>
    `À payer aux fournisseurs : ${due} TND; à récupérer des fournisseurs : ${refund} TND. ${source}`,
  customerLine: (due, refund, source) =>
    `À recevoir des clients : ${due} TND; à rembourser aux clients : ${refund} TND. ${source}`,
  balancesNote:
    'Les règlements comptabilisés, avoirs et corrections sont déjà reflétés dans ces soldes. Les chèques enregistrés ne prouvent pas leur encaissement bancaire.',
  partyScope:
    'Périmètre : factures rattachées à ce tiers. Les factures saisies sans tiers lié ne sont pas automatiquement assimilées à ce compte.',
  balanceRow: (number, party, type, outstanding, due, citation) =>
    `${number} — ${party} — ${type} — solde signé ${outstanding} TND — échéance ${due}. ${citation}`,
  moreInvoices: (total, source) =>
    `30 factures affichées sur ${total}; les totaux couvrent toutes les factures correspondantes. ${source}`,
  askReference:
    'Quel numéro de facture ou quelle référence de règlement voulez-vous consulter ?',
  oneReference:
    'Précisez soit le numéro de facture, soit la référence du règlement à consulter.',
  noInvoice:
    'Aucune facture métier ne correspond à ce numéro dans ce dossier. Un fichier seul n’est pas nécessairement une facture métier.',
  severalInvoices:
    'Ce numéro correspond à plusieurs factures/avoirs. Précisez achat ou vente, ou utilisez une référence unique.',
  invoiceDates: (date, due, net, vat, gross, payable, source) =>
    `Date ${date}; échéance ${due}. HT ${net}; TVA ${vat}; TTC ${gross}; net à payer ${payable} TND. ${source}`,
  invoiceSettlement: (paid, credited, outstanding, source) =>
    `Règlements nets pris en compte ${paid}; avoirs comptabilisés ${credited}; solde signé ${outstanding} TND (négatif = remboursement attendu). ${source}`,
  invoiceNote:
    'Montants comptables en TND après conversion éventuelle. Seuls les mouvements effectivement comptabilisés affectent le solde; un règlement annulé/brouillon est affiché comme historique, pas comme paiement effectif.',
  notPosted:
    'Cette facture n’est pas comptabilisée : ses montants ne constituent pas une dette/créance comptable publiée.',
  creditLine: (number, amount, status, citation) =>
    `Avoir ${number} : ${amount} TND — ${status}. ${citation}`,
  noPayment: (source) => `Aucun règlement affecté à cette facture. ${source}`,
  historyLimited:
    'Historique limité aux 50 premiers règlements et 50 premiers avoirs; le solde ci-dessus reste le solde complet enregistré.',
  paymentLine: (
    reference,
    date,
    direction,
    method,
    status,
    amount,
    allocated,
    instrument,
    correction,
    citation,
  ) =>
    `Règlement ${reference} — ${date} — ${direction} — ${method} — ${status} : ${amount} TND${allocated ? `; affectation à cette facture ${allocated} TND` : ''}${instrument ? `; instrument ${instrument}` : ''}${correction ? `; correction ${correction.type} le ${correction.date} (${correction.reason})` : ''}. ${citation}`,
  severalPayments:
    'Plusieurs règlements portent cette référence. Consultez les règlements pour identifier la facture concernée.',
  noPaymentReference:
    'Aucun règlement ne correspond à cette référence dans ce dossier.',
  paymentNote:
    'Ce règlement est un enregistrement comptable; il ne prouve pas à lui seul un transfert bancaire ou l’encaissement d’un chèque.',
  allocationLine: (number, allocated, outstanding, citation) =>
    `Facture ${number} : affectation ${allocated} TND; solde actuel ${outstanding} TND. ${citation}`,
  allocationsLimited: 'Affichage limité à 50 affectations.',
  askYear:
    'Pour quel exercice annuel souhaitez-vous le résumé financier ? Par exemple : « Résumé financier pour 2026 ».',
  summaryHeader: (name, year, start, end, source) =>
    `Résumé comptable de « ${name} » pour l’exercice ${year} (${start} au ${end}). ${source}`,
  summaryFinal: (version, at) =>
    `états finalisés, version ${version}, le ${at}`,
  summaryLive: (at) =>
    `états en temps réel générés le ${at}, à partir des écritures comptabilisées`,
  summarySource: (origin, source) => `Source : ${origin}. ${source}`,
  results: (operating, beforeTax, net, currency, source) =>
    `Résultat d’exploitation : ${operating} ${currency}; résultat avant impôt : ${beforeTax} ${currency}; résultat net : ${net} ${currency}. ${source}`,
  balanceSheet: (assets, liabilities, currency, source) =>
    `Total actif : ${assets} ${currency}; capitaux propres et passifs : ${liabilities} ${currency}. ${source}`,
  cash: (closing, variation, currency, source) =>
    `Trésorerie comptable de clôture : ${closing} ${currency}; variation : ${variation} ${currency}. Ce n’est pas un solde bancaire vérifié en direct. ${source}`,
  incomeLines: 'Produits/charges du compte de résultat :',
  control: (label, message, source) =>
    `Contrôle à vérifier : ${label} — ${message}. ${source}`,
  mappings: (count, source) =>
    `${count} compte(s) avec correspondance manquante : le résumé peut être incomplet. Vérifiez les mappings dans les états financiers. ${source}`,
  summaryNote:
    'Ces chiffres représentent les données enregistrées/finalisées, pas une certification de complétude ni un conseil fiscal. Un exercice vide peut afficher zéro.',
};

const EN: LiveFinancialText = {
  forbidden:
    'You do not have the permissions needed to view this financial data.',
  unsupportedPeriod:
    'Balances and payments are shown as they are now, and the financial summary covers a financial year. Ask for a current balance or the summary of a year; past balances and monthly summaries are not available here.',
  unknownRequest:
    'Name a third party, an invoice, a payment or the year of a financial summary.',
  severalParties: (list) =>
    `Several third parties match. Give the full name and whether it is a customer or a supplier: ${list}.`,
  noParty: (name) =>
    `No third party or posted invoice name matches “${name}” in this file. Check the name; this does not mean the balance is zero.`,
  notProvided: 'not provided',
  taxId: 'tax ID',
  partyBalances: (name) => `Balances of ${name}`,
  allBalances: 'Customer and supplier balances',
  invoice: (number) => `Invoice ${number}`,
  creditNote: (number) => `Credit note ${number}`,
  payment: (reference) => `Payment ${reference}`,
  statements: (year) => `Financial statements ${year}`,
  balancesHeader: (party, at, source) =>
    `Current balances${party ? ` of “${party}”` : ' of the file'}, at ${at}. Posted invoices only; accounting amounts in TND. ${source}`,
  supplierLine: (due, refund, source) =>
    `Owed to suppliers: ${due} TND; to recover from suppliers: ${refund} TND. ${source}`,
  customerLine: (due, refund, source) =>
    `Owed by customers: ${due} TND; to refund to customers: ${refund} TND. ${source}`,
  balancesNote:
    'Posted payments, credit notes and corrections are already included in these balances. A recorded cheque does not prove that the bank has cashed it.',
  partyScope:
    'Scope: invoices linked to this third party. Invoices entered without a linked third party are not added to this account automatically.',
  balanceRow: (number, party, type, outstanding, due, citation) =>
    `${number} — ${party} — ${type} — signed balance ${outstanding} TND — due ${due}. ${citation}`,
  moreInvoices: (total, source) =>
    `30 invoices shown out of ${total}; the totals cover all matching invoices. ${source}`,
  askReference: 'Which invoice number or payment reference do you want to see?',
  oneReference:
    'Give either the invoice number or the payment reference, not both.',
  noInvoice:
    'No business invoice has this number in this file. An uploaded file is not necessarily a business invoice.',
  severalInvoices:
    'This number matches several invoices or credit notes. Say whether it is a purchase or a sale, or use a unique reference.',
  invoiceDates: (date, due, net, vat, gross, payable, source) =>
    `Date ${date}; due ${due}. Excl. tax ${net}; VAT ${vat}; incl. tax ${gross}; net payable ${payable} TND. ${source}`,
  invoiceSettlement: (paid, credited, outstanding, source) =>
    `Net payments applied ${paid}; posted credit notes ${credited}; signed balance ${outstanding} TND (negative = refund expected). ${source}`,
  invoiceNote:
    'Accounting amounts in TND after any conversion. Only posted movements change the balance; a cancelled or draft payment is shown as history, not as an actual payment.',
  notPosted:
    'This invoice is not posted: its amounts are not a recorded payable or receivable.',
  creditLine: (number, amount, status, citation) =>
    `Credit note ${number}: ${amount} TND — ${status}. ${citation}`,
  noPayment: (source) => `No payment is allocated to this invoice. ${source}`,
  historyLimited:
    'History limited to the first 50 payments and 50 credit notes; the balance above is still the full recorded balance.',
  paymentLine: (
    reference,
    date,
    direction,
    method,
    status,
    amount,
    allocated,
    instrument,
    correction,
    citation,
  ) =>
    `Payment ${reference} — ${date} — ${direction} — ${method} — ${status}: ${amount} TND${allocated ? `; allocated to this invoice ${allocated} TND` : ''}${instrument ? `; instrument ${instrument}` : ''}${correction ? `; correction ${correction.type} on ${correction.date} (${correction.reason})` : ''}. ${citation}`,
  severalPayments:
    'Several payments have this reference. Open the payments list to identify the invoice.',
  noPaymentReference: 'No payment matches this reference in this file.',
  paymentNote:
    'This payment is an accounting record; on its own it does not prove a bank transfer or that a cheque was cashed.',
  allocationLine: (number, allocated, outstanding, citation) =>
    `Invoice ${number}: allocated ${allocated} TND; current balance ${outstanding} TND. ${citation}`,
  allocationsLimited: 'Showing at most 50 allocations.',
  askYear:
    'For which financial year do you want the summary? For example: “Financial summary for 2026”.',
  summaryHeader: (name, year, start, end, source) =>
    `Accounting summary of “${name}” for the financial year ${year} (${start} to ${end}). ${source}`,
  summaryFinal: (version, at) =>
    `final statements, version ${version}, on ${at}`,
  summaryLive: (at) =>
    `live statements generated on ${at} from the posted entries`,
  summarySource: (origin, source) => `Source: ${origin}. ${source}`,
  results: (operating, beforeTax, net, currency, source) =>
    `Operating result: ${operating} ${currency}; result before tax: ${beforeTax} ${currency}; net result: ${net} ${currency}. ${source}`,
  balanceSheet: (assets, liabilities, currency, source) =>
    `Total assets: ${assets} ${currency}; equity and liabilities: ${liabilities} ${currency}. ${source}`,
  cash: (closing, variation, currency, source) =>
    `Closing cash in the accounts: ${closing} ${currency}; change: ${variation} ${currency}. This is not a live-checked bank balance. ${source}`,
  incomeLines: 'Income statement lines:',
  control: (label, message, source) =>
    `Check to review: ${label} — ${message}. ${source}`,
  mappings: (count, source) =>
    `${count} account(s) without a mapping: the summary may be incomplete. Check the mappings in the financial statements. ${source}`,
  summaryNote:
    'These figures are the recorded or final data, not a certification of completeness or tax advice. An empty year can show zero.',
};

const AR: LiveFinancialText = {
  forbidden: 'ليست لديك الصلاحيات اللازمة للاطلاع على هذه البيانات المالية.',
  unsupportedPeriod:
    'تُعرض الأرصدة والدفعات بحالتها الحالية، ويغطي الملخص المالي سنة مالية. اطلب رصيداً حالياً أو ملخص سنة؛ الأرصدة السابقة والملخصات الشهرية غير متاحة هنا.',
  unknownRequest: 'حدّد طرفاً أو فاتورة أو دفعة أو سنة الملخص المالي.',
  severalParties: (list) =>
    `تتطابق عدة أطراف. حدّد الاسم الكامل وهل هو حريف أم مزوّد: ${list}.`,
  noParty: (name) =>
    `لا يوجد طرف أو اسم فاتورة مرحّلة يطابق «${name}» في هذا الملف. تحقّق من الاسم؛ هذا لا يعني أن الرصيد صفر.`,
  notProvided: 'غير مذكور',
  taxId: 'المعرّف الجبائي',
  partyBalances: (name) => `أرصدة ${name}`,
  allBalances: 'أرصدة الحرفاء والمزوّدين',
  invoice: (number) => `فاتورة ${number}`,
  creditNote: (number) => `فاتورة تعديل ${number}`,
  payment: (reference) => `دفعة ${reference}`,
  statements: (year) => `القوائم المالية ${year}`,
  balancesHeader: (party, at, source) =>
    `الأرصدة الحالية${party ? ` لـ «${party}»` : ' للملف'} في ${at}. الفواتير المرحّلة فقط؛ المبالغ المحاسبية بالدينار. ${source}`,
  supplierLine: (due, refund, source) =>
    `المستحق للمزوّدين: ${due} دينار؛ المسترجع من المزوّدين: ${refund} دينار. ${source}`,
  customerLine: (due, refund, source) =>
    `المستحق من الحرفاء: ${due} دينار؛ المسترجع للحرفاء: ${refund} دينار. ${source}`,
  balancesNote:
    'الدفعات المرحّلة وفواتير التعديل والتصحيحات محتسبة في هذه الأرصدة. الشيك المسجّل لا يثبت صرفه من البنك.',
  partyScope:
    'النطاق: الفواتير المرتبطة بهذا الطرف. الفواتير المسجّلة دون طرف مرتبط لا تُضاف تلقائياً إلى هذا الحساب.',
  balanceRow: (number, party, type, outstanding, due, citation) =>
    `${number} — ${party} — ${type} — الرصيد ${outstanding} دينار — الاستحقاق ${due}. ${citation}`,
  moreInvoices: (total, source) =>
    `عُرضت 30 فاتورة من ${total}؛ المجاميع تشمل كل الفواتير المطابقة. ${source}`,
  askReference: 'ما رقم الفاتورة أو مرجع الدفعة الذي تريد الاطلاع عليه؟',
  oneReference: 'حدّد إما رقم الفاتورة أو مرجع الدفعة.',
  noInvoice:
    'لا توجد فاتورة تجارية بهذا الرقم في هذا الملف. الملف المرفوع ليس بالضرورة فاتورة تجارية.',
  severalInvoices:
    'هذا الرقم يطابق عدة فواتير أو فواتير تعديل. حدّد شراء أو بيع، أو استعمل مرجعاً فريداً.',
  invoiceDates: (date, due, net, vat, gross, payable, source) =>
    `التاريخ ${date}؛ الاستحقاق ${due}. دون الأداءات ${net}؛ الأداء على القيمة المضافة ${vat}؛ باعتبار الأداءات ${gross}؛ الصافي للدفع ${payable} دينار. ${source}`,
  invoiceSettlement: (paid, credited, outstanding, source) =>
    `الدفعات الصافية المحتسبة ${paid}؛ فواتير التعديل المرحّلة ${credited}؛ الرصيد ${outstanding} دينار (سالب = استرجاع منتظر). ${source}`,
  invoiceNote:
    'المبالغ المحاسبية بالدينار بعد التحويل إن وُجد. الحركات المرحّلة فقط تغيّر الرصيد؛ الدفعة الملغاة أو المسودة تُعرض كتاريخ لا كدفعة فعلية.',
  notPosted:
    'هذه الفاتورة غير مرحّلة: مبالغها ليست ديناً أو حقاً محاسبياً مسجّلاً.',
  creditLine: (number, amount, status, citation) =>
    `فاتورة تعديل ${number}: ${amount} دينار — ${status}. ${citation}`,
  noPayment: (source) => `لا توجد دفعة مخصّصة لهذه الفاتورة. ${source}`,
  historyLimited:
    'السجل محدود بأول 50 دفعة و50 فاتورة تعديل؛ الرصيد أعلاه هو الرصيد الكامل المسجّل.',
  paymentLine: (
    reference,
    date,
    direction,
    method,
    status,
    amount,
    allocated,
    instrument,
    correction,
    citation,
  ) =>
    `دفعة ${reference} — ${date} — ${direction} — ${method} — ${status}: ${amount} دينار${allocated ? `؛ المخصّص لهذه الفاتورة ${allocated} دينار` : ''}${instrument ? `؛ الأداة ${instrument}` : ''}${correction ? `؛ تصحيح ${correction.type} بتاريخ ${correction.date} (${correction.reason})` : ''}. ${citation}`,
  severalPayments:
    'عدة دفعات تحمل هذا المرجع. راجع قائمة الدفعات لتحديد الفاتورة.',
  noPaymentReference: 'لا توجد دفعة تطابق هذا المرجع في هذا الملف.',
  paymentNote:
    'هذه الدفعة تسجيل محاسبي؛ ولا تثبت وحدها تحويلاً بنكياً أو صرف شيك.',
  allocationLine: (number, allocated, outstanding, citation) =>
    `فاتورة ${number}: المخصّص ${allocated} دينار؛ الرصيد الحالي ${outstanding} دينار. ${citation}`,
  allocationsLimited: 'يُعرض 50 تخصيصاً على الأكثر.',
  askYear: 'لأي سنة مالية تريد الملخص؟ مثلاً: «الملخص المالي لسنة 2026».',
  summaryHeader: (name, year, start, end, source) =>
    `الملخص المحاسبي لـ «${name}» للسنة المالية ${year} (${start} إلى ${end}). ${source}`,
  summaryFinal: (version, at) =>
    `قوائم نهائية، النسخة ${version}، بتاريخ ${at}`,
  summaryLive: (at) => `قوائم آنية أُنشئت في ${at} من القيود المرحّلة`,
  summarySource: (origin, source) => `المصدر: ${origin}. ${source}`,
  results: (operating, beforeTax, net, currency, source) =>
    `نتيجة الاستغلال: ${operating} ${currency}؛ النتيجة قبل الضريبة: ${beforeTax} ${currency}؛ النتيجة الصافية: ${net} ${currency}. ${source}`,
  balanceSheet: (assets, liabilities, currency, source) =>
    `مجموع الأصول: ${assets} ${currency}؛ الأموال الذاتية والخصوم: ${liabilities} ${currency}. ${source}`,
  cash: (closing, variation, currency, source) =>
    `الخزينة المحاسبية عند الإقفال: ${closing} ${currency}؛ التغيّر: ${variation} ${currency}. هذا ليس رصيداً بنكياً متحققاً منه آنياً. ${source}`,
  incomeLines: 'بنود قائمة النتائج:',
  control: (label, message, source) =>
    `مراقبة للتثبت: ${label} — ${message}. ${source}`,
  mappings: (count, source) =>
    `${count} حساب(ات) دون ربط: قد يكون الملخص غير مكتمل. تحقّق من الربط في القوائم المالية. ${source}`,
  summaryNote:
    'هذه الأرقام تمثّل البيانات المسجّلة أو النهائية، وليست شهادة اكتمال ولا استشارة جبائية. قد تُظهر سنة فارغة صفراً.',
};

export const LIVE_FINANCIAL_TEXT: Record<AnswerLanguage, LiveFinancialText> = {
  fr: FR,
  en: EN,
  ar: AR,
};
