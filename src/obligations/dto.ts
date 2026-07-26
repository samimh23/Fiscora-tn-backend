import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DossierLegalForm,
  DossierTaxRegime,
  ObligationFrequency,
  ObligationStatus,
} from '../database/entities';

const moneyPattern = /^\d{1,12}(\.\d{1,3})?$/;

export class CreateObligationTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Le code doit contenir uniquement A-Z, 0-9 et underscore.',
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsEnum(ObligationFrequency)
  frequency!: ObligationFrequency;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @IsInt()
  @Min(0)
  @Max(12)
  dueMonthOffset!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  annualDueMonth?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  physicalPersonDueDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  totallyExportingDueDay?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(DossierLegalForm, { each: true })
  legalForms?: DossierLegalForm[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(DossierTaxRegime, { each: true })
  taxRegimes?: DossierTaxRegime[];

  @IsOptional()
  @IsBoolean()
  requiresVat?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresEmployees?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  sourceLabel?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  sourceUrl?: string | null;
}

export class GenerateObligationsDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class ObligationQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsEnum(ObligationStatus)
  status?: ObligationStatus;
}

export class UpdateObligationProgressDto {
  @IsIn([ObligationStatus.InProgress, ObligationStatus.ReadyForReview])
  status!: ObligationStatus.InProgress | ObligationStatus.ReadyForReview;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string | null;
}

export class RejectObligationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comment!: string;
}

export class FileObligationDto {
  @IsOptional()
  @IsDateString()
  filedAtUtc?: string;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern)
  amountDue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class PayObligationDto {
  @IsString()
  @Matches(moneyPattern)
  amountPaid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentReference?: string | null;
}
