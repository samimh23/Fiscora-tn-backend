import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  SaasBillingCycle,
  SaasInvoiceStatus,
  SaasSubscriptionStatus,
} from '../database/entities';

export class CreateSaasPlanDto {
  @IsString()
  @Length(2, 50)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  monthlyPriceTnd!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  annualPriceTnd!: number;

  @IsInt()
  @Min(1)
  maxCollaborators!: number;

  @IsInt()
  @Min(1)
  maxActiveDossiers!: number;

  @IsInt()
  @Min(1)
  maxStorageGb!: number;

  @IsInt()
  @Min(0)
  monthlyOcrDocuments!: number;

  @IsInt()
  @Min(0)
  monthlyTtnSubmissions!: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}

export class UpdateSaasPlanDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  monthlyPriceTnd?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  annualPriceTnd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCollaborators?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxActiveDossiers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxStorageGb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyOcrDocuments?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyTtnSubmissions?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateOrganizationSubscriptionDto {
  @IsString()
  @Length(2, 50)
  planCode!: string;

  @IsEnum(SaasSubscriptionStatus)
  status!: SaasSubscriptionStatus;

  @IsEnum(SaasBillingCycle)
  billingCycle!: SaasBillingCycle;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;

  @IsString()
  @Length(8, 500)
  reason!: string;
}

export class CreateSaasInvoiceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  dueInDays?: number;

  @IsOptional()
  @IsEnum(SaasInvoiceStatus)
  status?: SaasInvoiceStatus;

  @IsString()
  @Length(8, 500)
  reason!: string;
}

export class RecordSaasPaymentDto {
  @IsString()
  @Length(2, 160)
  paymentReference!: string;

  @IsString()
  @Length(8, 500)
  reason!: string;
}
