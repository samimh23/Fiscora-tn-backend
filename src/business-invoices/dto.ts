import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  BusinessInvoiceKind,
  BusinessInvoiceNature,
  BusinessInvoiceType,
} from '../database/entities';

const money = /^\d+(\.\d{1,3})?$/;
const rate = /^\d+(\.\d{1,5})?$/;
const quantity = /^\d+(\.\d{1,3})?$/;

export class BusinessInvoiceLineDto {
  @IsUUID()
  accountId!: string;

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

export class SaveBusinessInvoiceDto {
  @IsEnum(BusinessInvoiceType)
  type!: BusinessInvoiceType;

  @IsEnum(BusinessInvoiceNature)
  nature!: BusinessInvoiceNature;

  @IsOptional()
  @IsEnum(BusinessInvoiceKind)
  kind = BusinessInvoiceKind.Invoice;

  @IsOptional()
  @IsUUID()
  thirdPartyId?: string;

  @IsOptional()
  @IsUUID()
  originalInvoiceId?: string;

  @IsString()
  @MaxLength(80)
  number!: string;

  @IsDateString()
  invoiceDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsString()
  @MaxLength(200)
  thirdPartyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  thirdPartyTaxIdentifier?: string;

  @IsUUID()
  journalId!: string;

  @IsUUID()
  thirdPartyAccountId!: string;

  @IsOptional()
  @IsUUID()
  vatAccountId?: string;

  @IsOptional()
  @IsUUID()
  stampAccountId?: string;

  @IsOptional()
  @IsUUID()
  withholdingAccountId?: string;

  @IsOptional()
  @Matches(money)
  stampDuty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  withholdingNature?: string;

  @IsOptional()
  @Matches(money)
  withholdingBase?: string;

  @IsOptional()
  @IsUUID()
  sourceDocumentId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BusinessInvoiceLineDto)
  lines!: BusinessInvoiceLineDto[];
}
