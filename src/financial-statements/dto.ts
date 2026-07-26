import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CashFlowCategory,
  FinancialStatementSection,
} from '../database/entities';

export class UpsertFinancialStatementMappingDto {
  @IsOptional()
  @IsEnum(FinancialStatementSection)
  statementSection?: FinancialStatementSection | null;

  @IsOptional()
  @IsEnum(CashFlowCategory)
  cashFlowCategory?: CashFlowCategory | null;
}

export class FinancialStatementExportQueryDto {
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';
}

export class UpdateFinancialStatementNoteSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  statementLineCodes?: string[];
}

export class FinancialStatementNoteReviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  comment!: string;
}

export class AttachFinancialStatementNoteDocumentDto {
  @IsUUID()
  documentId!: string;
}
