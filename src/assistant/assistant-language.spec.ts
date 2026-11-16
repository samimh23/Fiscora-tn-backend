import {
  answerLanguageRule,
  detectQuestionLanguage,
} from './assistant-language';

describe('detectQuestionLanguage', () => {
  it.each([
    ['how much this phone cost ?', 'en'],
    ['did we buy a phone ?', 'en'],
    ['what the availble documents we have', 'en'],
    ['Quel est le total TTC de la facture ?', 'fr'],
    ['combien de fournisseurs', 'fr'],
    ['TVA ?', 'fr'],
    ['كم عدد المزودين؟', 'ar'],
    ['ما هي قيمة الأداء على القيمة المضافة في فاتورة MYTEK ؟', 'ar'],
  ])('"%s" → %s', (question, language) => {
    expect(detectQuestionLanguage(question)).toBe(language);
  });
});

describe('answerLanguageRule', () => {
  it('names the language explicitly', () => {
    expect(answerLanguageRule('en')).toContain('anglais (English)');
    expect(answerLanguageRule('ar')).toContain('arabe');
  });
});
