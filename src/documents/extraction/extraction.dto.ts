import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
