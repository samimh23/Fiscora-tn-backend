import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BillingFrequency,
  DossierAssignmentRole,
  DossierLegalForm,
  DossierStatus,
  DossierTaxRegime,
} from '../database/entities';

const moneyPattern = /^\d{1,12}(\.\d{1,3})?$/;
const tunisianTaxIdentifierPattern = /^\d{7,8}\s*\/?\s*[A-Z]\s*\/?\s*[A-Z]\s*\/?\s*\d{3}$/i;
const rnePattern = /^[A-Z0-9][A-Z0-9\-_/ ]{4,24}$/i;

export class CreateDossierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(tunisianTaxIdentifierPattern, {
    message:
      'Le matricule fiscal doit ressembler à 1234567/A/M/000 ou 1234567AM000.',
  })
  taxIdentifier?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(rnePattern, {
    message: 'Le numéro RNE doit contenir uniquement lettres, chiffres et séparateurs simples.',
  })
  rneNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customsCode?: string | null;

  @IsEnum(DossierLegalForm)
  legalForm!: DossierLegalForm;

  @IsEnum(DossierTaxRegime)
  taxRegime!: DossierTaxRegime;

  @IsBoolean()
  isVatSubject!: boolean;

  @IsBoolean()
  hasVatSuspension!: boolean;

  @IsBoolean()
  isTotallyExporting!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  activitySector?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cnssEmployerNumber?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  employeeCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  fiscalYearStartDay?: number;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern, {
    message: 'Les honoraires mensuels doivent contenir au maximum 3 décimales.',
  })
  monthlyFee?: string | null;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern, {
    message: 'Les honoraires annuels doivent contenir au maximum 3 décimales.',
  })
  annualFee?: string | null;

  @IsOptional()
  @IsEnum(BillingFrequency)
  billingFrequency?: BillingFrequency;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  internalNotes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

export class UpdateDossierDto extends PartialType(CreateDossierDto) {
  @IsOptional()
  @IsIn([DossierStatus.Active, DossierStatus.Suspended])
  status?: DossierStatus.Active | DossierStatus.Suspended;
}

export class DossierQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(DossierStatus)
  status?: DossierStatus;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class CreateDossierContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  whatsappNumber?: string | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateDossierContactDto extends PartialType(
  CreateDossierContactDto,
) {
  @IsOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertDossierAssignmentDto {
  @IsEnum(DossierAssignmentRole)
  assignmentRole!: DossierAssignmentRole;

  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  monthlyTimeBudgetMinutes?: number | null;
}
