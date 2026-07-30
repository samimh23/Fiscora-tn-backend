import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  CommercialDocumentDirection,
  CommercialDocumentKind,
} from '../database/entities';

const money = /^\d+(\.\d{1,3})?$/;
const rate = /^\d+(\.\d{1,5})?$/;
const quantity = /^\d+(\.\d{1,3})?$/;

export class CommercialDocumentLineDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  @Matches(quantity)
  quantity = '1.000';

  @Matches(money)
  unitPrice!: string;

  @IsOptional()
  @Matches(rate)
  discountRate = '0.00000';

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatCode?: string;

  @IsOptional()
  @Matches(rate)
  vatRate?: string;
}

export class SaveCommercialDocumentDto {
  @IsEnum(CommercialDocumentDirection)
  direction!: CommercialDocumentDirection;

  @IsEnum(CommercialDocumentKind)
  kind!: CommercialDocumentKind;

  @IsString()
  @MaxLength(80)
  number!: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsUUID()
  thirdPartyId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currencyCode = 'TND';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommercialDocumentLineDto)
  lines!: CommercialDocumentLineDto[];
}

export class ConvertCommercialDocumentDto {
  @IsEnum(CommercialDocumentKind)
  targetKind!: CommercialDocumentKind;

  @IsString()
  @MaxLength(80)
  number!: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
