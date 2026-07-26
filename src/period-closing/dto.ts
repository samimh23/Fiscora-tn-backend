import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { ClosingAdjustmentType } from '../database/entities';

const money = /^\d+(\.\d{1,3})?$/;

export class PeriodYearQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year!: number;
}

export class LockPeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReopenPeriodDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class AdjustmentLineDto {
  @IsUUID()
  accountId!: string;

  @IsString()
  @MaxLength(300)
  label!: string;

  @Matches(money)
  debit = '0.000';

  @Matches(money)
  credit = '0.000';
}

export class CreateClosingAdjustmentDto {
  @IsEnum(ClosingAdjustmentType)
  type!: ClosingAdjustmentType;

  @IsDateString()
  entryDate!: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  @IsUUID()
  journalId!: string;

  @IsOptional()
  @IsDateString()
  reversalDate?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines!: AdjustmentLineDto[];
}

export class CloseAccountingYearDto {
  @IsUUID()
  closingJournalId!: string;

  @IsUUID()
  openingJournalId!: string;

  @IsUUID()
  resultAccountId!: string;
}
