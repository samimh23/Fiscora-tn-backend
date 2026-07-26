import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  FiscalParameterCode,
  FiscalParameterValueType,
} from '../database/entities';

const decimal = /^\d+(\.\d{1,5})?$/;
const money = /^\d+(\.\d{1,3})?$/;

export class CreateFiscalParameterDto {
  @IsEnum(FiscalParameterCode)
  code!: FiscalParameterCode;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsEnum(FiscalParameterValueType)
  valueType!: FiscalParameterValueType;

  @Matches(decimal)
  value!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  sourceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateVatRateDto {
  @IsString()
  @MaxLength(30)
  code!: string;

  @IsString()
  @MaxLength(160)
  label!: string;

  @Matches(decimal)
  rate!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  sourceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;
}

export class CreateWithholdingRateDto {
  @IsString()
  @MaxLength(80)
  natureCode!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @Matches(decimal)
  rate!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  sourceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;
}

export class IncomeTaxBracketDto {
  @Matches(money)
  lowerBound!: string;

  @IsOptional()
  @Matches(money)
  upperBound?: string | null;

  @Matches(decimal)
  rate!: string;
}

export class CreateIncomeTaxScaleDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  sourceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IncomeTaxBracketDto)
  brackets!: IncomeTaxBracketDto[];
}
