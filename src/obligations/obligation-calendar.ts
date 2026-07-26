import {
  ClientDossier,
  DossierLegalForm,
  ObligationFrequency,
  ObligationTemplate,
} from '../database/entities';

type CalendarTemplate = Pick<
  ObligationTemplate,
  | 'frequency'
  | 'dueDay'
  | 'dueMonthOffset'
  | 'annualDueMonth'
  | 'physicalPersonDueDay'
  | 'totallyExportingDueDay'
>;

type CalendarDossier = Pick<ClientDossier, 'legalForm' | 'isTotallyExporting'>;

export interface GeneratedObligationPeriod {
  periodYear: number;
  periodMonth: number | null;
  periodQuarter: number | null;
  periodStartsOn: string;
  periodEndsOn: string;
  dueOn: string;
}

export function buildObligationPeriods(
  template: CalendarTemplate,
  dossier: CalendarDossier,
  year: number,
): GeneratedObligationPeriod[] {
  if (template.frequency === ObligationFrequency.Monthly) {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return {
        periodYear: year,
        periodMonth: month,
        periodQuarter: Math.ceil(month / 3),
        periodStartsOn: isoDate(year, month, 1),
        periodEndsOn: isoDate(year, month, daysInMonth(year, month)),
        dueOn: dueDate(template, dossier, year, month, template.dueMonthOffset),
      };
    });
  }

  if (template.frequency === ObligationFrequency.Quarterly) {
    return Array.from({ length: 4 }, (_, index) => {
      const quarter = index + 1;
      const startMonth = index * 3 + 1;
      const endMonth = startMonth + 2;
      return {
        periodYear: year,
        periodMonth: null,
        periodQuarter: quarter,
        periodStartsOn: isoDate(year, startMonth, 1),
        periodEndsOn: isoDate(year, endMonth, daysInMonth(year, endMonth)),
        dueOn: dueDate(
          template,
          dossier,
          year,
          endMonth,
          template.dueMonthOffset,
        ),
      };
    });
  }

  const dueYear = year + template.dueMonthOffset;
  const dueMonth = template.annualDueMonth ?? 12;
  return [
    {
      periodYear: year,
      periodMonth: null,
      periodQuarter: null,
      periodStartsOn: isoDate(year, 1, 1),
      periodEndsOn: isoDate(year, 12, 31),
      dueOn: isoDate(
        dueYear,
        dueMonth,
        Math.min(template.dueDay, daysInMonth(dueYear, dueMonth)),
      ),
    },
  ];
}

function dueDate(
  template: CalendarTemplate,
  dossier: CalendarDossier,
  periodYear: number,
  periodMonth: number,
  monthOffset: number,
) {
  const date = new Date(Date.UTC(periodYear, periodMonth - 1 + monthOffset, 1));
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + 1;
  let day = template.dueDay;
  if (
    dossier.legalForm === DossierLegalForm.PhysicalPerson &&
    template.physicalPersonDueDay
  ) {
    day = template.physicalPersonDueDay;
  }
  if (dossier.isTotallyExporting && template.totallyExportingDueDay) {
    day = template.totallyExportingDueDay;
  }
  return isoDate(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  );
}

function isoDate(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
