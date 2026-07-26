import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const signedMoney = /^-?\d+(\.\d{1,3})?$/;

export class CreateBankAccountDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(150)
  bankName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
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
}
