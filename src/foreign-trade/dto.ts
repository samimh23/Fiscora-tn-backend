import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { TradeDirection } from '../database/entities';

const money = /^\d+(\.\d{1,3})?$/;
const rate = /^\d+(\.\d{1,8})?$/;

export class SaveExchangeRateDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currencyCode!: string;

  @IsDateString()
  effectiveDate!: string;

  @Matches(rate)
  rate!: string;

  @IsString()
  @MaxLength(250)
  sourceLabel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;
}

export class CreateVatSuspensionCertificateDto {
  @IsString()
  @MaxLength(120)
  number!: string;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validTo!: string;

  @Matches(money)
  authorizedBase!: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SaveForeignTradeOperationDto {
  @IsEnum(TradeDirection)
  direction!: TradeDirection;

  @IsString()
  @MaxLength(120)
  reference!: string;

  @IsDateString()
  operationDate!: string;

  @IsString()
  @MaxLength(200)
  thirdPartyName!: string;

  @Matches(/^[A-Za-z]{2}$/)
  countryCode!: string;

  @Matches(/^[A-Za-z]{3}$/)
  currencyCode!: string;

  @Matches(money)
  foreignAmount!: string;

  @IsOptional()
  @Matches(rate)
  exchangeRate?: string;

  @IsOptional()
  @Matches(money)
  freightAmount = '0.000';

  @IsOptional()
  @Matches(money)
  insuranceAmount = '0.000';

  @IsOptional()
  @Matches(money)
  customsDuties = '0.000';

  @IsOptional()
  @Matches(money)
  importVat = '0.000';

  @IsOptional()
  @Matches(money)
  otherCosts = '0.000';

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  incoterm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customsDeclarationNumber?: string;

  @IsOptional()
  @IsDateString()
  customsDeclarationDate?: string;

  @IsOptional()
  @IsUUID()
  vatSuspensionCertificateId?: string;

  @IsUUID()
  journalId!: string;

  @IsUUID()
  tradeAccountId!: string;

  @IsUUID()
  thirdPartyAccountId!: string;

  @IsOptional()
  @IsUUID()
  vatAccountId?: string;
}

export class SettleForeignTradeOperationDto {
  @IsDateString()
  settlementDate!: string;

  @Matches(rate)
  settlementRate!: string;

  @IsUUID()
  journalId!: string;

  @IsUUID()
  fxGainAccountId!: string;

  @IsUUID()
  fxLossAccountId!: string;

  @IsOptional()
  @IsDateString()
  repatriationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  repatriationBankReference?: string;

  @IsOptional()
  @IsUUID()
  repatriationProofDocumentId?: string;
}
