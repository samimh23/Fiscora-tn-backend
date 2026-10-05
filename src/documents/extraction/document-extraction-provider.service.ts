import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentCategory } from '../../database/entities';
import { NuExtractExtractionClientService } from './nuextract-extraction-client.service';

export const EXTRACTABLE_DOCUMENT_CATEGORIES = [
  DocumentCategory.Purchases,
  DocumentCategory.Sales,
  DocumentCategory.Bank,
] as const;

@Injectable()
export class DocumentExtractionProviderService {
  constructor(private readonly nuextract: NuExtractExtractionClientService) {}

  select(category: DocumentCategory) {
    if (category === DocumentCategory.Bank)
      return {
        client: this.nuextract,
        documentKind: 'bank_statement' as const,
      };
    if (
      category === DocumentCategory.Purchases ||
      category === DocumentCategory.Sales
    )
      return { client: this.nuextract, documentKind: 'invoice' as const };
    throw new BadRequestException(
      'L’extraction IA est réservée aux factures d’achats, factures de ventes et relevés bancaires. Classez le document dans une de ces catégories avant extraction.',
    );
  }
}
