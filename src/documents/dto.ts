import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DocumentCategory,
  DocumentProcessingStatus,
  ExtractionStatus,
} from '../database/entities';

export class UploadDocumentDto {
  @IsEnum(DocumentCategory)
  category: DocumentCategory = DocumentCategory.Inbox;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  obligationId?: string;

  @IsOptional()
  @IsUUID()
  replacesDocumentId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isClientVisible?: boolean;
}

export class UpdateDocumentDto {
  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number | null;

  @IsEnum(DocumentProcessingStatus)
  processingStatus!: DocumentProcessingStatus;

  @IsOptional()
  @IsEnum(ExtractionStatus)
  extractionStatus?: ExtractionStatus;

  @IsOptional()
  @IsBoolean()
  isClientVisible?: boolean;
}

export class CreateExpectationDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @IsString()
  @MaxLength(250)
  label!: string;

  @IsEnum(DocumentCategory)
  category!: DocumentCategory;
}

export class DocumentQueryDto {
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  periodYear?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  periodMonth?: number;
}
