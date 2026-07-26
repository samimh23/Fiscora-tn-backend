import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JournalType } from '../database/entities';

const money = /^\d+(\.\d{1,3})?$/;

export class CreateJournalDto {
  @IsString()
  @MaxLength(20)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsEnum(JournalType)
  type!: JournalType;
}

export class EntryLineDto {
  @IsUUID()
  accountId!: string;

  @IsString()
  @MaxLength(300)
  label!: string;

  @Matches(money)
  debit = '0.000';

  @Matches(money)
  credit = '0.000';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  thirdPartyName?: string;
}

export class CreateEntryDto {
  @IsUUID()
  journalId!: string;

  @IsDateString()
  entryDate!: string;

  @IsString()
  @MaxLength(100)
  pieceReference!: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  @IsOptional()
  @IsUUID()
  sourceDocumentId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => EntryLineDto)
  lines!: EntryLineDto[];
}

export class ReportQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class RejectEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  comment!: string;
}

export class CreateReconciliationDto {
  @IsUUID()
  accountId!: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  lineIds!: string[];

  @IsOptional()
  @IsDateString()
  reconciliationDate?: string;
}

export class ReconciliationQueryDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class ExportReportQueryDto extends ReportQueryDto {
  @IsIn(['xlsx', 'pdf'])
  format!: 'xlsx' | 'pdf';
}
