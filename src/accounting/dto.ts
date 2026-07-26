import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CompanyProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradingName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxIdentifier?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string | null;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsString()
  @Length(3, 3)
  baseCurrencyCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  addressLine1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  addressLine2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null;
}

export class CreateFiscalYearDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;
}

const accountTypes = [
  'Actif',
  'Passif',
  'CapitauxPropres',
  'Produit',
  'Charge',
  'HorsBilan',
  'Asset',
  'Liability',
  'Equity',
  'Revenue',
  'Expense',
  'OffBalanceSheet',
];
const balances = ['Débit', 'Crédit', 'Debit', 'Credit'];

export class CreateLedgerAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsIn(accountTypes)
  type!: string;

  @IsIn(balances)
  normalBalance!: string;

  @IsOptional()
  @IsUUID()
  parentAccountId?: string | null;

  @IsBoolean()
  allowsPosting = true;
}

export class UpdateLedgerAccountDto extends CreateLedgerAccountDto {
  @IsBoolean()
  isActive!: boolean;
}

export class LedgerAccountsQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive = false;
}
