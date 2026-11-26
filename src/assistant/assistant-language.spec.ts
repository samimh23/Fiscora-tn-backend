import {
  answerInWrongLanguage,
  answerLanguageRule,
  detectQuestionLanguage,
  systemLanguageRule,
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

describe('answerInWrongLanguage', () => {
  const frenchAnswer =
    'Le téléphone coûte 599 DNT [S4]. Une validation humaine reste nécessaire pour toute décision comptable ou fiscale.';
  const englishAnswer =
    'The phone costs 599 DNT [S4]. A human review is still required for any accounting or tax decision.';

  it('flags a French answer to an English question', () => {
    expect(answerInWrongLanguage(frenchAnswer, 'en')).toBe(true);
    expect(answerInWrongLanguage(englishAnswer, 'en')).toBe(false);
  });

  it('flags an answer without Arabic script for an Arabic question', () => {
    expect(answerInWrongLanguage(frenchAnswer, 'ar')).toBe(true);
    expect(answerInWrongLanguage('ثمن الهاتف 599 دينار [S4].', 'ar')).toBe(
      false,
    );
  });

  it('does not retry a short answer with no clear language', () => {
    expect(answerInWrongLanguage('Tunis [S1]', 'en')).toBe(false);
    expect(answerInWrongLanguage('599 DNT [S4]', 'ar')).toBe(false);
  });
});

describe('systemLanguageRule', () => {
  it('states the answer language in that language, and adds nothing for French', () => {
    expect(systemLanguageRule('en')).toContain('ANSWER LANGUAGE: ENGLISH');
    expect(systemLanguageRule('ar')).toContain('العربية');
    expect(systemLanguageRule('fr')).toBe('');
  });
});
