import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const money = /^-?\d{1,12}(\.\d{1,3})?$/;
const positiveMoney = /^\d{1,12}(\.\d{1,3})?$/;
const rate = /^(0(\.\d{1,5})?|1(\.0{1,5})?)$/;

export class AnnualTaxAdjustmentDto {
  @IsString()
  @MaxLength(180)
  label!: string;

  @Matches(positiveMoney)
  amount!: string;
}

export class AnnualTaxCalculationDto {
  @IsOptional()
  @IsIn(['IS', 'FORFAITAIRE'])
  regime?: 'IS' | 'FORFAITAIRE';

  @IsOptional()
  @Matches(rate)
  corporateTaxRate?: string;

  @IsOptional()
  @Matches(positiveMoney)
  minimumTax?: string;

  @IsOptional()
  @Matches(positiveMoney)
  taxCredits?: string;

  @IsOptional()
  @Matches(money)
  priorYearCorporateTax?: string;

  @IsOptional()
  @Matches(positiveMoney)
  forfaitaireTax?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AnnualTaxAdjustmentDto)
  reintegrations?: AnnualTaxAdjustmentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AnnualTaxAdjustmentDto)
  deductions?: AnnualTaxAdjustmentDto[];
}

export class AnnualTaxExportQueryDto {
  @IsOptional()
  @IsIn(['pdf', 'csv'])
  format: 'pdf' | 'csv' = 'pdf';

  @IsOptional()
  @IsIn(['IS', 'FORFAITAIRE'])
  regime?: 'IS' | 'FORFAITAIRE';

  @IsOptional()
  @Matches(rate)
  corporateTaxRate?: string;

  @IsOptional()
  @Matches(positiveMoney)
  minimumTax?: string;

  @IsOptional()
  @Matches(positiveMoney)
  taxCredits?: string;

  @IsOptional()
  @Matches(money)
  priorYearCorporateTax?: string;

  @IsOptional()
  @Matches(positiveMoney)
  forfaitaireTax?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  _?: number;
}
