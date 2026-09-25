import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentCategory } from '../../database/entities';
import type {
  DocumentExtractionClient,
  FinancialDocumentKind,
} from './document-extraction-client';
import { NuExtractExtractionClientService } from './nuextract-extraction-client.service';
import { QwenExtractionClientService } from './qwen-extraction-client.service';

@Injectable()
export class DocumentExtractionProviderService {
  constructor(
    private readonly config: ConfigService,
    private readonly qwen: QwenExtractionClientService,
    private readonly nuextract: NuExtractExtractionClientService,
  ) {}

  select(
    category: DocumentCategory,
    pinnedModelName?: string | null,
  ): {
    client: DocumentExtractionClient;
    documentKind: FinancialDocumentKind;
  } {
    const documentKind = this.documentKind(category);
    if (pinnedModelName === this.nuextract.modelName)
      return { client: this.nuextract, documentKind };
    if (pinnedModelName === this.qwen.modelName)
      return { client: this.qwen, documentKind };

    const configured = this.config
      .get<string>('DOCUMENT_EXTRACTION_PROVIDER', 'qwen')
      .trim()
      .toLowerCase();
    if (configured === 'nuextract' && documentKind !== 'auto')
      return { client: this.nuextract, documentKind };
    if (configured !== 'qwen' && configured !== 'nuextract')
      throw new Error(
        `Unsupported DOCUMENT_EXTRACTION_PROVIDER: ${configured}`,
      );
    // Generic inbox/legal/payroll documents still need classification. Keep
    // Qwen as the fallback because NuExtract is deliberately schema-bound.
    return { client: this.qwen, documentKind };
  }

  private documentKind(category: DocumentCategory): FinancialDocumentKind {
    if (category === DocumentCategory.Bank) return 'bank_statement';
    if (
      category === DocumentCategory.Purchases ||
      category === DocumentCategory.Sales
    )
      return 'invoice';
    return 'auto';
  }
}
