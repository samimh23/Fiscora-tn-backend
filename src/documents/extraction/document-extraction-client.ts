import type { OcrDocument } from './ocr-evidence-matcher';

export type FinancialDocumentKind = 'invoice' | 'bank_statement' | 'auto';

export type ExtractionClientResult = {
  data: Record<string, unknown>;
  modelName: string;
  provider: 'nuextract';
  rawResponse: Record<string, unknown>;
};

export interface DocumentExtractionClient {
  readonly modelName: string;
  readonly provider: 'nuextract';

  extract(
    content: Buffer,
    mimeType: string,
    correctionIssues?: Array<Record<string, unknown>>,
    documentKind?: FinancialDocumentKind,
  ): Promise<ExtractionClientResult>;

  extractFromOcr(
    document: OcrDocument,
    correctionIssues?: Array<Record<string, unknown>>,
    documentKind?: FinancialDocumentKind,
  ): Promise<ExtractionClientResult>;

  extractImages?(
    images: Array<{ content: Buffer; mimeType: string; page: number }>,
    correctionIssues?: Array<Record<string, unknown>>,
    documentKind?: FinancialDocumentKind,
  ): Promise<ExtractionClientResult>;
}
