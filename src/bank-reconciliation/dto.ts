import { Transform } from 'class-transformer';
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
import { BankRuleDirection, BankRuleMatchType } from '../database/entities';

const signedMoney = /^-?\d+(\.\d{1,3})?$/;
const tunisianIbanOrRib = /^(TN\d{22}|\d{20})$/i;

export class CreateBankAccountDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(150)
  bankName!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/[\s.\-_/]/g, '').toUpperCase()
      : value,
  )
  @IsString()
  @MaxLength(50)
  @Matches(tunisianIbanOrRib, {
    message:
      'IBAN/RIB invalide : utilisez un IBAN tunisien TN + 22 chiffres ou un RIB de 20 chiffres.',
  })
  iban?: string;

  @IsUUID()
  ledgerAccountId!: string;

  @IsUUID()
  journalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}

export class ImportBankStatementDto {
  @IsUUID()
  bankAccountId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @Matches(signedMoney)
  openingBalance!: string;

  @Matches(signedMoney)
  closingBalance!: string;
}

export class MatchPaymentDto {
  @IsUUID()
  paymentId!: string;
}

export class MatchJournalEntryDto {
  @IsUUID()
  journalEntryId!: string;
}

export class GenerateBankEntryDto {
  @IsUUID()
  counterpartAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pieceReference?: string;

  @IsOptional()
  @IsBoolean()
  rememberRule?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  ruleLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rulePattern?: string;
}

export class CreateBankRuleDto {
  @IsString()
  @MaxLength(150)
  label!: string;

  @IsString()
  @MaxLength(500)
  pattern!: string;

  @IsOptional()
  @IsEnum(BankRuleMatchType)
  matchType?: BankRuleMatchType;

  @IsOptional()
  @IsEnum(BankRuleDirection)
  direction?: BankRuleDirection;

  @IsUUID()
  suggestedAccountId!: string;

  @IsOptional()
  @IsUUID()
  suggestedThirdPartyId?: string;
}
