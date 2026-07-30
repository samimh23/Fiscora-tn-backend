import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ExportColumn {
  key: string;
  label: string;
  width?: number;
}

function formatExportValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return value.toString();
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

@Injectable()
export class BookkeepingExportService {
  async xlsx(
    title: string,
    columns: ExportColumn[],
    rows: Array<Record<string, unknown>>,
  ) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Compta TN';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(title.slice(0, 31));
    sheet.columns = columns.map((item) => ({
      header: item.label,
      key: item.key,
      width: item.width ?? 20,
    }));
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF145B48' },
    };
    header.alignment = { vertical: 'middle' };
    rows.forEach((row) =>
      sheet.addRow(
        Object.fromEntries(
          columns.map((column) => [column.key, row[column.key] ?? '']),
        ),
      ),
    );
    sheet.autoFilter = {
      from: 'A1',
      to: `${this.columnLetter(columns.length)}1`,
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  pdf(
    title: string,
    subtitle: string,
    columns: ExportColumn[],
    rows: Array<Record<string, unknown>>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        layout: columns.length > 6 ? 'landscape' : 'portrait',
        margin: 32,
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.fontSize(18).fillColor('#12372d').text(title);
      document.moveDown(0.2).fontSize(9).fillColor('#555').text(subtitle);
      document.moveDown(0.8);
      const startX = document.page.margins.left;
      const available =
        document.page.width -
        document.page.margins.left -
        document.page.margins.right;
      const totalWeight = columns.reduce(
        (sum, item) => sum + (item.width ?? 20),
        0,
      );
      const widths = columns.map(
        (item) => (available * (item.width ?? 20)) / totalWeight,
      );
      const drawHeader = () => {
        const y = document.y;
        document.rect(startX, y, available, 20).fill('#145b48');
        let x = startX;
        columns.forEach((column, index) => {
          document
            .fillColor('#fff')
            .fontSize(7)
            .text(column.label, x + 3, y + 6, {
              width: widths[index] - 6,
              lineBreak: false,
            });
          x += widths[index];
        });
        document.y = y + 24;
      };
      drawHeader();
      rows.forEach((row, rowIndex) => {
        if (document.y > document.page.height - 48) {
          document.addPage();
          drawHeader();
        }
        const y = document.y;
        if (rowIndex % 2 === 1)
          document.rect(startX, y - 2, available, 17).fill('#f4f3ed');
        let x = startX;
        columns.forEach((column, index) => {
          document
            .fillColor('#1c2824')
            .fontSize(7)
            .text(formatExportValue(row[column.key]), x + 3, y + 2, {
              width: widths[index] - 6,
              lineBreak: false,
            });
          x += widths[index];
        });
        document.y = y + 17;
      });
      document.end();
    });
  }

  private columnLetter(value: number) {
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }
}
