import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type {
  FinancialNoteTable,
  FinancialStatementNoteReportSection,
} from './financial-statement-note-definitions';
import type {
  FinancialStatementLine,
  FinancialStatementReport,
} from './financial-statements.service';

@Injectable()
export class FinancialStatementExportService {
  async toXlsx(report: FinancialStatementReport) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Compta TN';
    workbook.created = new Date(report.generatedAtUtc);
    workbook.modified = new Date(report.generatedAtUtc);
    workbook.properties.date1904 = false;

    this.addStatementSheet(
      workbook,
      'Bilan',
      'BILAN',
      [
        { title: 'ACTIFS', lines: report.balanceSheet.assets },
        {
          title: 'CAPITAUX PROPRES ET PASSIFS',
          lines: report.balanceSheet.equityAndLiabilities,
        },
      ],
      [
        ['Total des actifs', report.balanceSheet.totalAssets],
        [
          'Total des capitaux propres et des passifs',
          report.balanceSheet.totalEquityAndLiabilities,
        ],
        ['Écart d’équilibre', report.balanceSheet.balanceDifference],
      ],
      report,
    );
    this.addStatementSheet(
      workbook,
      'État de résultat',
      'ÉTAT DE RÉSULTAT',
      [
        {
          title: 'PRÉSENTATION PAR NATURE',
          lines: report.incomeStatement.lines,
        },
      ],
      [
        ['Résultat d’exploitation', report.incomeStatement.operatingResult],
        [
          'Résultat des activités ordinaires avant impôt',
          report.incomeStatement.ordinaryResultBeforeTax,
        ],
        ['Résultat net de l’exercice', report.incomeStatement.netResult],
      ],
      report,
    );
    this.addStatementSheet(
      workbook,
      'Flux de trésorerie',
      'ÉTAT DES FLUX DE TRÉSORERIE',
      [
        {
          title: 'MÉTHODE DIRECTE - NC 01',
          lines: report.cashFlowStatement.lines,
        },
      ],
      [
        ['Flux net d’exploitation', report.cashFlowStatement.operatingCashFlow],
        [
          'Flux net d’investissement',
          report.cashFlowStatement.investingCashFlow,
        ],
        ['Flux net de financement', report.cashFlowStatement.financingCashFlow],
        [
          'Incidence des variations de change',
          report.cashFlowStatement.exchangeEffect,
        ],
        ['Variation de trésorerie', report.cashFlowStatement.cashVariation],
        [
          'Trésorerie au début de l’exercice',
          report.cashFlowStatement.openingCash,
        ],
        [
          'Trésorerie à la fin de l’exercice',
          report.cashFlowStatement.closingCash,
        ],
        ['Flux non classés', report.cashFlowStatement.unclassifiedCashFlow],
        [
          'Écart de rapprochement',
          report.cashFlowStatement.reconciliationDifference,
        ],
      ],
      report,
    );
    this.addNotesSheet(workbook, report);
    this.addControlsSheet(workbook, report);
    this.addSourcesSheet(workbook, report);

    const bytes = await workbook.xlsx.writeBuffer();
    return Buffer.from(bytes);
  }

  async toPdf(report: FinancialStatementReport) {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 42, right: 42, bottom: 42, left: 42 },
      bufferPages: true,
      info: {
        Title: `États financiers ${report.period.year} - ${report.dossier.legalName}`,
        Author: 'Compta TN',
        Subject: report.standard,
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    this.pdfCover(document, report);
    document.addPage();
    this.pdfStatement(
      document,
      'Bilan - Actifs',
      report.balanceSheet.assets,
      [
        ['TOTAL DES ACTIFS', report.balanceSheet.totalAssets],
        ['Écart d’équilibre', report.balanceSheet.balanceDifference],
      ],
      report,
    );
    document.addPage();
    this.pdfStatement(
      document,
      'Bilan - Capitaux propres et passifs',
      report.balanceSheet.equityAndLiabilities,
      [
        [
          'TOTAL CAPITAUX PROPRES ET PASSIFS',
          report.balanceSheet.totalEquityAndLiabilities,
        ],
      ],
      report,
    );
    document.addPage();
    this.pdfStatement(
      document,
      'État de résultat',
      report.incomeStatement.lines,
      [
        ['Résultat d’exploitation', report.incomeStatement.operatingResult],
        [
          'Résultat des activités ordinaires avant impôt',
          report.incomeStatement.ordinaryResultBeforeTax,
        ],
        ['RÉSULTAT NET DE L’EXERCICE', report.incomeStatement.netResult],
      ],
      report,
    );
    document.addPage();
    this.pdfStatement(
      document,
      'État des flux de trésorerie',
      report.cashFlowStatement.lines,
      [
        ['Flux net d’exploitation', report.cashFlowStatement.operatingCashFlow],
        [
          'Flux net d’investissement',
          report.cashFlowStatement.investingCashFlow,
        ],
        ['Flux net de financement', report.cashFlowStatement.financingCashFlow],
        ['Variation de trésorerie', report.cashFlowStatement.cashVariation],
        ['Trésorerie au début', report.cashFlowStatement.openingCash],
        ['TRÉSORERIE À LA FIN', report.cashFlowStatement.closingCash],
        ['Flux non classés', report.cashFlowStatement.unclassifiedCashFlow],
      ],
      report,
    );
    document.addPage();
    this.pdfControls(document, report);
    if (report.notes) this.pdfNotes(document, report);

    const pages = document.bufferedPageRange();
    for (
      let index = pages.start;
      index < pages.start + pages.count;
      index += 1
    ) {
      document.switchToPage(index);
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748B')
        .text(
          `${report.dossier.legalName} - ${report.period.endsOn} - Page ${index + 1}/${pages.count}`,
          42,
          784,
          { align: 'center', width: 511 },
        );
    }
    document.end();
    return done;
  }

  private addStatementSheet(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    title: string,
    sections: Array<{ title: string; lines: FinancialStatementLine[] }>,
    totals: Array<[string, { current: string; previous: string }]>,
    report: FinancialStatementReport,
  ) {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
      pageSetup: {
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
      },
    });
    sheet.columns = [
      { key: 'note', width: 10 },
      { key: 'label', width: 58 },
      { key: 'current', width: 18 },
      { key: 'previous', width: 18 },
    ];
    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = report.dossier.legalName;
    sheet.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF14532D' },
    };
    sheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(1).height = 30;
    sheet.mergeCells('A2:D2');
    sheet.getCell('A2').value = title;
    sheet.getCell('A2').font = {
      bold: true,
      size: 14,
      color: { argb: 'FF14532D' },
    };
    sheet.mergeCells('A3:D3');
    sheet.getCell('A3').value =
      `${report.standard} - Exprimé en ${report.currencyCode}`;
    sheet.getCell('A3').font = {
      italic: true,
      size: 9,
      color: { argb: 'FF64748B' },
    };
    sheet.mergeCells('A4:D4');
    sheet.getCell('A4').value =
      `Exercice du ${report.period.startsOn} au ${report.period.endsOn}`;
    const header = sheet.getRow(6);
    header.values = [
      'Notes',
      'Rubrique',
      `N (${report.period.year})`,
      `N-1 (${report.comparisonPeriod.year})`,
    ];
    this.styleHeader(header, 4);
    let rowIndex = 7;
    for (const section of sections) {
      const sectionRow = sheet.getRow(rowIndex++);
      sectionRow.values = [null, section.title, null, null];
      for (let column = 1; column <= 4; column += 1) {
        sectionRow.getCell(column).font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        sectionRow.getCell(column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F6B52' },
        };
      }
      for (const line of section.lines) {
        const row = sheet.getRow(rowIndex++);
        row.values = [
          line.noteNumber,
          line.label,
          Number(line.current),
          Number(line.previous),
        ];
        row.getCell(2).alignment = { indent: 1, wrapText: true };
        row.getCell(3).numFmt = '#,##0.000;[Red](#,##0.000);-';
        row.getCell(4).numFmt = '#,##0.000;[Red](#,##0.000);-';
        for (let column = 1; column <= 4; column += 1) {
          row.getCell(column).border = {
            bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
          };
        }
      }
      rowIndex += 1;
    }
    for (const [label, values] of totals) {
      const row = sheet.getRow(rowIndex++);
      row.values = [
        null,
        label,
        Number(values.current),
        Number(values.previous),
      ];
      for (let column = 1; column <= 4; column += 1) {
        row.getCell(column).font = {
          bold: true,
          color: { argb: 'FF0F172A' },
        };
        row.getCell(column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDCFCE7' },
        };
        row.getCell(column).border = {
          top: { style: 'thin', color: { argb: 'FF14532D' } },
        };
      }
      row.getCell(3).numFmt = '#,##0.000;[Red](#,##0.000);-';
      row.getCell(4).numFmt = '#,##0.000;[Red](#,##0.000);-';
    }
    sheet.autoFilter = { from: 'A6', to: `D${Math.max(6, rowIndex - 1)}` };
    sheet.headerFooter.oddFooter = `&L${report.dossier.legalName}&C${report.period.endsOn}&RPage &P / &N`;
  }

  private addNotesSheet(
    workbook: ExcelJS.Workbook,
    report: FinancialStatementReport,
  ) {
    const sheet = workbook.addWorksheet('Notes annexes', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
      },
    });
    sheet.columns = [
      { width: 10 },
      { width: 34 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
    ];
    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = 'NOTES AUX ÉTATS FINANCIERS';
    sheet.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF14532D' },
    };
    sheet.getRow(1).height = 30;
    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value =
      `${report.dossier.legalName} - Exercice ${report.period.year} - ${report.currencyCode}`;
    sheet.mergeCells('A3:H3');
    sheet.getCell('A3').value = report.notes
      ? `Statut : ${report.notes.status}${report.notes.validatedAtUtc ? ` - Validées le ${report.notes.validatedAtUtc}` : ''}`
      : 'Statut : annexes non générées';
    sheet.getCell('A3').font = {
      italic: true,
      color: { argb: report.notes ? 'FF166534' : 'FFB91C1C' },
    };

    let rowIndex = 5;
    if (!report.notes) {
      sheet.mergeCells(`A${rowIndex}:H${rowIndex + 1}`);
      sheet.getCell(`A${rowIndex}`).value =
        'Les notes aux états financiers ne sont pas encore générées.';
      sheet.getCell(`A${rowIndex}`).alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      return;
    }

    for (const section of report.notes.sections) {
      sheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
      const titleCell = sheet.getCell(`A${rowIndex}`);
      titleCell.value = `Note ${section.noteNumber} - ${section.title}`;
      titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F6B52' },
      };
      titleCell.alignment = { vertical: 'middle' };
      sheet.getRow(rowIndex).height = 24;
      rowIndex += 1;

      sheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
      const contentCell = sheet.getCell(`A${rowIndex}`);
      contentCell.value =
        section.content || 'Aucun commentaire complémentaire.';
      contentCell.alignment = { wrapText: true, vertical: 'top' };
      contentCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      sheet.getRow(rowIndex).height = Math.min(
        90,
        Math.max(30, 15 * Math.ceil(contentCell.value.length / 110)),
      );
      rowIndex += 1;

      if (section.statementLineCodes.length) {
        sheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
        sheet.getCell(`A${rowIndex}`).value =
          `Rubriques liées : ${section.statementLineCodes.join(', ')}`;
        sheet.getCell(`A${rowIndex}`).font = {
          italic: true,
          size: 9,
          color: { argb: 'FF64748B' },
        };
        rowIndex += 1;
      }

      for (const table of section.autoData) {
        rowIndex = this.addNoteTable(sheet, rowIndex, table);
      }

      if (section.documents.length) {
        sheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
        sheet.getCell(`A${rowIndex}`).value =
          `Pièces justificatives : ${section.documents
            .map(
              (document) => `${document.originalName} (v${document.version})`,
            )
            .join(' ; ')}`;
        sheet.getCell(`A${rowIndex}`).alignment = { wrapText: true };
        sheet.getCell(`A${rowIndex}`).font = {
          italic: true,
          color: { argb: 'FF475569' },
        };
        rowIndex += 1;
      }
      rowIndex += 1;
    }
    sheet.headerFooter.oddFooter = `&L${report.dossier.legalName}&CNotes annexes ${report.period.year}&RPage &P / &N`;
  }

  private addNoteTable(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    table: FinancialNoteTable,
  ) {
    const firstColumn = 2;
    const lastColumn = Math.min(8, firstColumn + table.columns.length - 1);
    sheet.mergeCells(startRow, firstColumn, startRow, lastColumn);
    const title = sheet.getCell(startRow, firstColumn);
    title.value = table.title;
    title.font = { bold: true, color: { argb: 'FF14532D' } };
    startRow += 1;

    const header = sheet.getRow(startRow);
    table.columns.slice(0, 7).forEach((column, index) => {
      const cell = header.getCell(firstColumn + index);
      cell.value = column.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF14532D' },
      };
      cell.alignment = { wrapText: true, vertical: 'middle' };
    });
    header.height = 28;
    startRow += 1;

    if (!table.rows.length) {
      sheet.mergeCells(startRow, firstColumn, startRow, lastColumn);
      sheet.getCell(startRow, firstColumn).value =
        table.emptyMessage ?? 'Aucune donnée disponible.';
      sheet.getCell(startRow, firstColumn).font = {
        italic: true,
        color: { argb: 'FF64748B' },
      };
      return startRow + 2;
    }

    for (const data of table.rows) {
      const row = sheet.getRow(startRow++);
      table.columns.slice(0, 7).forEach((column, index) => {
        const cell = row.getCell(firstColumn + index);
        const rawValue = data[column.key];
        cell.value =
          rawValue === null || rawValue === undefined
            ? null
            : column.type === 'TEXT'
              ? String(rawValue)
              : Number(rawValue);
        cell.alignment = {
          vertical: 'top',
          wrapText: column.type === 'TEXT',
          horizontal: column.type === 'TEXT' ? 'left' : 'right',
        };
        if (column.type === 'MONEY') {
          cell.numFmt = '#,##0.000;[Red](#,##0.000);-';
        } else if (column.type === 'NUMBER') {
          cell.numFmt = '#,##0;[Red](#,##0);-';
        }
        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        };
      });
    }
    return startRow + 1;
  }

  private addControlsSheet(
    workbook: ExcelJS.Workbook,
    report: FinancialStatementReport,
  ) {
    const sheet = workbook.addWorksheet('Contrôles', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });
    sheet.columns = [
      { width: 30 },
      { width: 44 },
      { width: 14 },
      { width: 18 },
      { width: 18 },
      { width: 58 },
    ];
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'CONTRÔLES ET PISTE D’AUDIT';
    sheet.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF14532D' },
    };
    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value =
      `Source : ${report.source} - Généré le ${report.generatedAtUtc}`;
    const header = sheet.getRow(4);
    header.values = [
      'Code',
      'Contrôle',
      'Statut',
      `Écart N`,
      `Écart N-1`,
      'Message',
    ];
    this.styleHeader(header, 6);
    report.controls.forEach((control, index) => {
      const row = sheet.getRow(index + 5);
      row.values = [
        control.code,
        control.label,
        control.status,
        Number(control.currentDifference),
        Number(control.previousDifference),
        control.message,
      ];
      row.getCell(3).font = {
        bold: true,
        color: { argb: control.status === 'OK' ? 'FF166534' : 'FFB91C1C' },
      };
      row.getCell(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: control.status === 'OK' ? 'FFDCFCE7' : 'FFFEE2E2' },
      };
      row.getCell(4).numFmt = '#,##0.000;[Red](#,##0.000);-';
      row.getCell(5).numFmt = '#,##0.000;[Red](#,##0.000);-';
      row.alignment = { vertical: 'top', wrapText: true };
    });
  }

  private addSourcesSheet(
    workbook: ExcelJS.Workbook,
    report: FinancialStatementReport,
  ) {
    const sheet = workbook.addWorksheet('Références', {
      views: [{ showGridLines: false }],
    });
    sheet.columns = [{ width: 34 }, { width: 95 }];
    sheet.getRow(1).values = ['Référence', 'Source'];
    this.styleHeader(sheet.getRow(1), 2);
    sheet.addRow([
      'NC 01 - Norme Comptable Générale',
      'https://oect.org.tn/wp-content/uploads/2023/01/NC_01.pdf',
    ]);
    sheet.addRow([
      'Conseil National de la Comptabilité',
      'https://www.finances.gov.tn/fr/conseil-national-de-la-comptabilite-cnc',
    ]);
    sheet.addRow(['Référentiel appliqué', report.standard]);
    sheet.addRow(['Devise', report.currencyCode]);
    sheet.addRow([
      'Empreinte du snapshot',
      report.snapshot?.sourceHash ?? 'Aperçu en temps réel',
    ]);
    sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  }

  private styleHeader(row: ExcelJS.Row, columnCount: number) {
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF14532D' },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
    row.height = 25;
  }

  private pdfCover(
    document: PDFKit.PDFDocument,
    report: FinancialStatementReport,
  ) {
    document.rect(0, 0, 595, 190).fill('#14532D');
    document
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('COMPTA TN', 42, 48)
      .fontSize(28)
      .text('États financiers', 42, 84)
      .fontSize(16)
      .font('Helvetica')
      .text(`Exercice ${report.period.year}`, 42, 126);
    document
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(report.dossier.legalName, 42, 240, { width: 511 })
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#475569')
      .text(
        `Matricule fiscal : ${report.dossier.taxIdentifier ?? 'Non renseigné'}`,
        42,
        282,
      )
      .text(`RNE : ${report.dossier.rneNumber ?? 'Non renseigné'}`, 42, 302)
      .text(
        `Période : ${report.period.startsOn} au ${report.period.endsOn}`,
        42,
        322,
      )
      .text(`Devise : ${report.currencyCode}`, 42, 342);
    document
      .roundedRect(42, 390, 511, 110, 8)
      .fillAndStroke('#F0FDF4', '#86EFAC')
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Référentiel', 60, 412)
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#334155')
      .text(report.standard, 60, 438, { width: 475 })
      .text(
        report.source === 'SNAPSHOT_DEFINITIF'
          ? 'Document définitif figé après clôture.'
          : 'Aperçu en temps réel non définitif.',
        60,
        468,
        { width: 475 },
      );
    document
      .fillColor('#64748B')
      .fontSize(9)
      .text(`Généré le ${report.generatedAtUtc}`, 42, 720);
  }

  private pdfStatement(
    document: PDFKit.PDFDocument,
    title: string,
    lines: FinancialStatementLine[],
    totals: Array<[string, { current: string; previous: string }]>,
    report: FinancialStatementReport,
  ) {
    this.pdfPageHeader(document, title, report);
    let y = 112;
    let lastGroup = '';
    for (const line of lines) {
      if (line.group !== lastGroup) {
        if (y > 700) {
          document.addPage();
          this.pdfPageHeader(document, title, report);
          y = 112;
        }
        document.rect(42, y, 511, 22).fill('#DCFCE7');
        document
          .fillColor('#14532D')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(line.group.toUpperCase(), 50, y + 6, { width: 495 });
        y += 26;
        lastGroup = line.group;
      }
      document
        .fillColor('#0F172A')
        .font('Helvetica')
        .fontSize(9)
        .text(line.label, 50, y + 4, { width: 255 })
        .text(line.noteNumber ? String(line.noteNumber) : '-', 315, y + 4, {
          width: 32,
          align: 'center',
        })
        .text(this.formatMoney(line.current), 360, y + 4, {
          width: 88,
          align: 'right',
        })
        .text(this.formatMoney(line.previous), 457, y + 4, {
          width: 88,
          align: 'right',
        });
      document
        .moveTo(42, y + 20)
        .lineTo(553, y + 20)
        .strokeColor('#E2E8F0')
        .stroke();
      y += 22;
    }
    y += 12;
    for (const [label, values] of totals) {
      document.rect(42, y, 511, 25).fill('#F0FDF4');
      document
        .fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(label, 50, y + 7, { width: 300 })
        .text(this.formatMoney(values.current), 360, y + 7, {
          width: 88,
          align: 'right',
        })
        .text(this.formatMoney(values.previous), 457, y + 7, {
          width: 88,
          align: 'right',
        });
      y += 29;
    }
  }

  private pdfPageHeader(
    document: PDFKit.PDFDocument,
    title: string,
    report: FinancialStatementReport,
  ) {
    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(title, 42, 42, { width: 511 })
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748B')
      .text(
        `${report.dossier.legalName} - ${report.period.startsOn} au ${report.period.endsOn} - ${report.currencyCode}`,
        42,
        70,
      );
    document
      .fillColor('#334155')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('Note', 315, 94, { width: 32, align: 'center' })
      .text(`N (${report.period.year})`, 360, 94, { width: 88, align: 'right' })
      .text(`N-1 (${report.comparisonPeriod.year})`, 457, 94, {
        width: 88,
        align: 'right',
      });
  }

  private pdfControls(
    document: PDFKit.PDFDocument,
    report: FinancialStatementReport,
  ) {
    this.pdfPageHeader(document, 'Contrôles et piste d’audit', report);
    let y = 112;
    for (const control of report.controls) {
      const color = control.status === 'OK' ? '#166534' : '#B91C1C';
      const fill = control.status === 'OK' ? '#F0FDF4' : '#FEF2F2';
      document.roundedRect(42, y, 511, 72, 6).fillAndStroke(fill, color);
      document
        .fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`${control.status} - ${control.label}`, 54, y + 12, {
          width: 485,
        })
        .fillColor('#334155')
        .font('Helvetica')
        .fontSize(8)
        .text(
          `Écart N : ${control.currentDifference} | Écart N-1 : ${control.previousDifference}`,
          54,
          y + 34,
          { width: 485 },
        )
        .text(control.message, 54, y + 49, { width: 485 });
      y += 84;
    }
    document
      .fillColor('#64748B')
      .fontSize(8)
      .text(
        'Référence : NC 01 - https://oect.org.tn/wp-content/uploads/2023/01/NC_01.pdf',
        42,
        Math.min(y + 16, 720),
        { width: 511 },
      );
  }

  private pdfNotes(
    document: PDFKit.PDFDocument,
    report: FinancialStatementReport,
  ) {
    if (!report.notes) return;
    for (const section of report.notes.sections) {
      document.addPage();
      let y = this.pdfNoteHeader(document, report, section);
      for (const chunk of this.textChunks(
        section.content || 'Aucun commentaire complémentaire.',
      )) {
        const height = document.heightOfString(chunk, { width: 511 }) + 8;
        if (y + height > 750) {
          document.addPage();
          y = this.pdfNoteHeader(document, report, section, true);
        }
        document
          .fillColor('#334155')
          .font('Helvetica')
          .fontSize(9)
          .text(chunk, 42, y, { width: 511, lineGap: 2 });
        y += height;
      }
      y += 8;

      for (const table of section.autoData) {
        y = this.pdfNoteTable(document, report, section, table, y);
      }

      if (section.documents.length) {
        if (y > 700) {
          document.addPage();
          y = this.pdfNoteHeader(document, report, section, true);
        }
        document
          .fillColor('#14532D')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('Pièces justificatives', 42, y, { width: 511 });
        y += 17;
        for (const linkedDocument of section.documents) {
          if (y > 742) {
            document.addPage();
            y = this.pdfNoteHeader(document, report, section, true);
          }
          document
            .fillColor('#475569')
            .font('Helvetica')
            .fontSize(8)
            .text(
              `- ${linkedDocument.originalName} - version ${linkedDocument.version}`,
              50,
              y,
              { width: 495 },
            );
          y += 15;
        }
      }
    }
  }

  private pdfNoteHeader(
    document: PDFKit.PDFDocument,
    report: FinancialStatementReport,
    section: FinancialStatementNoteReportSection,
    continuation = false,
  ) {
    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(
        `Note ${section.noteNumber} - ${section.title}${continuation ? ' (suite)' : ''}`,
        42,
        42,
        { width: 511 },
      )
      .fillColor('#64748B')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `${report.dossier.legalName} - Exercice ${report.period.year} - ${section.source}`,
        42,
        72,
        { width: 511 },
      );
    document.moveTo(42, 91).lineTo(553, 91).strokeColor('#86EFAC').stroke();
    return 108;
  }

  private pdfNoteTable(
    document: PDFKit.PDFDocument,
    report: FinancialStatementReport,
    section: FinancialStatementNoteReportSection,
    table: FinancialNoteTable,
    initialY: number,
  ) {
    const columns = table.columns.slice(0, 7);
    const weights = columns.map((column) => (column.type === 'TEXT' ? 1.6 : 1));
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    const widths = weights.map((weight) => (511 * weight) / totalWeight);
    let y = initialY;
    const startNewPage = () => {
      document.addPage();
      y = this.pdfNoteHeader(document, report, section, true);
    };
    if (y + 65 > 750) startNewPage();
    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(table.title, 42, y, { width: 511 });
    y += 22;

    const drawHeader = () => {
      document.rect(42, y, 511, 30).fill('#14532D');
      let x = 42;
      columns.forEach((column, index) => {
        document
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(column.label, x + 4, y + 6, {
            width: widths[index] - 8,
            align: column.type === 'TEXT' ? 'left' : 'right',
          });
        x += widths[index];
      });
      y += 30;
    };
    drawHeader();

    if (!table.rows.length) {
      document
        .fillColor('#64748B')
        .font('Helvetica-Oblique')
        .fontSize(8)
        .text(table.emptyMessage ?? 'Aucune donnée disponible.', 48, y + 7, {
          width: 499,
        });
      y += 30;
      return y + 14;
    }

    for (const data of table.rows) {
      if (y + 28 > 750) {
        startNewPage();
        document
          .fillColor('#14532D')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(`${table.title} (suite)`, 42, y, { width: 511 });
        y += 18;
        drawHeader();
      }
      document.rect(42, y, 511, 26).fill('#F8FAFC');
      let x = 42;
      columns.forEach((column, index) => {
        const value = data[column.key];
        const display =
          value === null || value === undefined
            ? '-'
            : column.type === 'MONEY'
              ? this.formatMoney(String(value))
              : String(value);
        document
          .fillColor('#0F172A')
          .font('Helvetica')
          .fontSize(6.5)
          .text(display, x + 4, y + 7, {
            width: widths[index] - 8,
            align: column.type === 'TEXT' ? 'left' : 'right',
            ellipsis: true,
          });
        x += widths[index];
      });
      document
        .moveTo(42, y + 26)
        .lineTo(553, y + 26)
        .strokeColor('#E2E8F0')
        .stroke();
      y += 26;
    }
    return y + 16;
  }

  private textChunks(value: string, maximumLength = 700) {
    const paragraphs = value.split(/\r?\n/).filter((item) => item.trim());
    const chunks: string[] = [];
    for (const paragraph of paragraphs.length ? paragraphs : ['']) {
      const words = paragraph.split(/\s+/);
      let current = '';
      for (const word of words) {
        if (current && current.length + word.length + 1 > maximumLength) {
          chunks.push(current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      if (current) chunks.push(current);
    }
    return chunks.length ? chunks : ['Aucun commentaire complémentaire.'];
  }

  private formatMoney(value: string) {
    const amount = Number(value);
    return new Intl.NumberFormat('fr-TN', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount);
  }
}
