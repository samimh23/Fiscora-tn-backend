import { DossierLegalForm, ObligationFrequency } from '../database/entities';
import { buildObligationPeriods } from './obligation-calendar';

const monthlyTemplate = {
  frequency: ObligationFrequency.Monthly,
  dueDay: 28,
  dueMonthOffset: 1,
  annualDueMonth: null,
  physicalPersonDueDay: 15,
  totallyExportingDueDay: null,
};

describe('Moteur de calendrier des obligations', () => {
  it('génère le 28 du mois suivant pour une personne morale', () => {
    const periods = buildObligationPeriods(
      monthlyTemplate,
      {
        legalForm: DossierLegalForm.Sarl,
        isTotallyExporting: false,
      },
      2026,
    );

    expect(periods).toHaveLength(12);
    expect(periods[0].dueOn).toBe('2026-02-28');
    expect(periods[11].dueOn).toBe('2027-01-28');
  });

  it('génère le 15 du mois suivant pour une personne physique', () => {
    const periods = buildObligationPeriods(
      monthlyTemplate,
      {
        legalForm: DossierLegalForm.PhysicalPerson,
        isTotallyExporting: false,
      },
      2026,
    );

    expect(periods[0].dueOn).toBe('2026-02-15');
  });

  it('applique le délai CNSS exportateur au 25', () => {
    const periods = buildObligationPeriods(
      {
        frequency: ObligationFrequency.Quarterly,
        dueDay: 15,
        dueMonthOffset: 1,
        annualDueMonth: null,
        physicalPersonDueDay: null,
        totallyExportingDueDay: 25,
      },
      {
        legalForm: DossierLegalForm.Sarl,
        isTotallyExporting: true,
      },
      2026,
    );

    expect(periods).toHaveLength(4);
    expect(periods[0].periodEndsOn).toBe('2026-03-31');
    expect(periods[0].dueOn).toBe('2026-04-25');
  });
});
