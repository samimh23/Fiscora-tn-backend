import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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
