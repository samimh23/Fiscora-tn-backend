import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DepreciationMethod } from '../database/entities';

const money = /^\d+(\.\d{1,3})?$/;
const rate = /^0(\.\d{1,5})?$|^1(\.0{1,5})?$/;

export class CreateFixedAssetCategoryDto {
  @IsString()
  @MaxLength(30)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsUUID()
  assetAccountId!: string;

  @IsUUID()
  accumulatedDepreciationAccountId!: string;

  @IsUUID()
  depreciationExpenseAccountId!: string;

  @IsEnum(DepreciationMethod)
  defaultMethod!: DepreciationMethod;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1200)
  defaultUsefulLifeMonths!: number;

  @IsOptional()
  @Matches(rate)
  defaultDecliningRate?: string;
}

export class CreateFixedAssetDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(220)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  acquisitionDate!: string;

  @IsDateString()
  serviceDate!: string;

  @IsOptional()
  @IsUUID()
  purchaseInvoiceId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @Matches(money)
  acquisitionCost!: string;

  @Matches(money)
  residualValue!: string;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  accountingMethod?: DepreciationMethod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1200)
  usefulLifeMonths?: number;

  @IsOptional()
  @Matches(rate)
  accountingDecliningRate?: string;

  @IsEnum(DepreciationMethod)
  fiscalMethod!: DepreciationMethod;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1200)
  fiscalUsefulLifeMonths!: number;

  @IsOptional()
  @Matches(rate)
  fiscalDecliningRate?: string;
}

export class PostDepreciationDto {
  @IsUUID()
  journalId!: string;
}

export class DisposeFixedAssetDto {
  @IsDateString()
  disposalDate!: string;

  @Matches(money)
  proceeds!: string;

  @IsUUID()
  journalId!: string;

  @IsUUID()
  settlementAccountId!: string;

  @IsUUID()
  gainAccountId!: string;

  @IsUUID()
  lossAccountId!: string;
}

export class FixedAssetReportQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year!: number;
}
