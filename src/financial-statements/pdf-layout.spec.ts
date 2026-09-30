import PDFDocument from 'pdfkit';
import { FinancialStatementExportService } from './financial-statement-export.service';
import type { FinancialStatementReport } from './financial-statements.service';
import { PayrollService } from '../payroll/payroll.service';

describe('PDF layout regressions', () => {
  afterEach(() => jest.restoreAllMocks());
  it('fits all annual payroll columns inside the page with long employee names', async () => {
    const service = Object.create(PayrollService.prototype) as PayrollService;
    const amounts = {
      grossAnnual: '1234567.890',
      employeeCnssAnnual: '123456.789',
      taxableAnnual: '1111111.101',
      incomeTaxAnnual: '100000.000',
      netAnnual: '1011111.101',
    };
    jest.spyOn(service, 'annualEmployerDeclaration').mockResolvedValue({
      year: 2026,
      generatedAtUtc: '2026-09-30T00:00:00Z',
      employer: {
        legalName: 'TEST',
        taxIdentifier: 'TEST',
        cnssEmployerNumber: 'TEST',
      },
      employees: Array.from({ length: 40 }, (_, index) => ({
        ...amounts,
        employeeId: `test-${index}`,
        hireDate: '2026-01-01',
        fullName: `Salarié ${index} avec un nom composé volontairement long pour vérifier la mise en page`,
        cin: '00000000',
        cnssNumber: '000000000000',
      })),
      totals: amounts,
      warning: 'Document de test sans valeur fiscale.',
    });
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    const pages = jest.spyOn(PDFDocument.prototype, 'addPage');
    const bytes = await service.annualEmployerDeclarationPdf(
      'org',
      'dossier',
      'user',
      2026,
    );
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages.mock.calls.length).toBeGreaterThan(1);
    const netCells = text.mock.calls.filter(
      ([value]) => value === '1011111.101 TND',
    );
    expect(netCells).toHaveLength(41);
    for (const call of netCells) {
      const [, x, y, options] = call as [
        string,
        number,
        number,
        { width: number },
      ];
      expect(x + options.width).toBeLessThanOrEqual(806);
      expect(y).toBeLessThan(560);
    }
    expect(
      text.mock.calls.filter(([value]) => value === 'Net annuel').length,
    ).toBe(pages.mock.calls.length);
  });

  it('measures wrapped financial labels before placing subsequent rows', async () => {
    const service = new FinancialStatementExportService();
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 42, right: 42, bottom: 42, left: 42 },
    });
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    const report = {
      dossier: { legalName: 'TEST' },
      period: { year: 2026, startsOn: '2026-01-01', endsOn: '2026-12-31' },
      comparisonPeriod: { year: 2025 },
      currencyCode: 'TND',
    } as FinancialStatementReport;
    const lines = Array.from({ length: 36 }, (_, index) => ({
      label: `Flux ${index} provenant des activités d'exploitation et des ajustements non monétaires. Libellé volontairement long pour vérifier que la ligne suivante ne chevauche pas le texte.`,
      group: 'Activités opérationnelles',
      current: '123456789.123',
      previous: '12345.678',
      noteNumber: 1,
    }));
    const done = new Promise<void>((resolve, reject) => {
      document.on('end', resolve);
      document.on('error', reject);
    });
    document.resume();
    service['pdfStatement'](document, 'TEST', lines, [], report);
    document.end();
    await done;
    const labels = text.mock.calls.filter(([value]) =>
      String(value).startsWith('Flux '),
    );
    expect(labels).toHaveLength(36);
    let previousY = 0;
    for (const call of labels) {
      const y = call[2] as number;
      if (y > previousY) expect(y - previousY).toBeGreaterThanOrEqual(30);
      expect(y).toBeLessThan(770);
      previousY = y;
    }
    expect(service['formatMoney']('123456789.123')).not.toMatch(
      /[\u00a0\u202f]/,
    );
  });
});
