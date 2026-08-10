import { daysBetween, scorePaymentSuggestion } from './bank-match.engine';

const transaction = {
  transactionDate: '2026-05-25',
  description: 'Virement Meditel',
  reference: 'VIR-88213',
  amount: '12000.000',
};

describe('scorePaymentSuggestion', () => {
  it('classe en tête le règlement de même montant, même date et même référence', () => {
    const score = scorePaymentSuggestion(transaction, {
      paymentDate: '2026-05-25',
      amount: '12000.000',
      reference: 'VIR-88213',
      thirdPartyName: 'Meditel',
    });
    expect(score).not.toBeNull();
    expect(score!.exactAmount).toBe(true);
    expect(score!.confidence).toBe(100);
    expect(score!.reasons).toContain('Montant identique');
    expect(score!.reasons).toContain('Référence retrouvée');
  });

  it('reconnaît le tiers dans le libellé quand la référence diffère', () => {
    const score = scorePaymentSuggestion(transaction, {
      paymentDate: '2026-05-25',
      amount: '12000.000',
      reference: 'AUTRE-1',
      thirdPartyName: 'Meditel',
    });
    expect(score!.reasons).toContain('Tiers retrouvé');
    expect(score!.confidence).toBe(98);
  });

  it('décote un règlement éloigné dans le temps', () => {
    const near = scorePaymentSuggestion(transaction, {
      paymentDate: '2026-05-27',
      amount: '12000.000',
    });
    const far = scorePaymentSuggestion(transaction, {
      paymentDate: '2026-06-05',
      amount: '12000.000',
    });
    expect(near!.confidence).toBeGreaterThan(far!.confidence);
    expect(far!.reasons).toContain('11 j d’écart');
  });

  // Un montant différent doit rester visible mais jamais passer pour certain :
  // c'est ce qui empêche un rapprochement faux en un clic.
  it('propose un montant proche avec un score bas et un motif explicite', () => {
    const score = scorePaymentSuggestion(transaction, {
      paymentDate: '2026-05-25',
      amount: '11900.000',
    });
    expect(score).not.toBeNull();
    expect(score!.exactAmount).toBe(false);
    expect(score!.confidence).toBeLessThan(70);
    expect(score!.reasons[0]).toBe('Écart de 100.000 TND');
  });

  it('écarte un montant au-delà de 2 % d’écart', () => {
    expect(
      scorePaymentSuggestion(transaction, {
        paymentDate: '2026-05-25',
        amount: '11000.000',
      }),
    ).toBeNull();
  });

  it('compare la valeur absolue pour un décaissement', () => {
    const score = scorePaymentSuggestion(
      { ...transaction, amount: '-12000.000' },
      { paymentDate: '2026-05-25', amount: '12000.000' },
    );
    expect(score!.exactAmount).toBe(true);
  });

  it('mesure l’écart en jours sans tenir compte du sens', () => {
    expect(daysBetween('2026-05-25', '2026-05-20')).toBe(5);
    expect(daysBetween('2026-05-20', '2026-05-25')).toBe(5);
  });
});
