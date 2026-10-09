import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DocumentCategory } from '../../database/entities';
import { EXTRACTABLE_DOCUMENT_CATEGORIES } from './document-extraction-provider.service';

export class RequestExtractionDto {
  @IsOptional()
  @IsIn(EXTRACTABLE_DOCUMENT_CATEGORIES)
  category?: DocumentCategory;
}

export enum ExtractionReviewDecision {
  Approve = 'APPROUVER',
  Reject = 'REJETER',
}

export class ReviewExtractionDto {
  @IsEnum(ExtractionReviewDecision)
  decision!: ExtractionReviewDecision;

  @IsOptional()
  @IsObject()
  correctedData?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  forceApprove?: boolean;
}
