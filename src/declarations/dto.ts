import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

const money = /^-?\d+(\.\d{1,3})?$/;
const rate = /^\d+(\.\d{1,5})?$/;

export class UpsertMonthlyDeclarationDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @Matches(money)
  vatCollected = '0.000';

  @Matches(money)
  vatDeductible = '0.000';

  @Matches(money)
  vatCreditPrevious = '0.000';

  @Matches(money)
  withholdingTax = '0.000';

  @IsOptional()
  @Matches(money)
  withholdingBase?: string;

  @IsOptional()
  @IsString()
  withholdingNature?: string;

  @Matches(money)
  tfpBase = '0.000';

  @IsOptional()
  @Matches(rate)
  tfpRate?: string;

  @Matches(money)
  foprolosBase = '0.000';

  @IsOptional()
  @Matches(rate)
  foprolosRate?: string;

  @Matches(money)
  tclBase = '0.000';

  @IsOptional()
  @Matches(rate)
  tclRate?: string;

  @IsOptional()
  @Matches(money)
  stampDuty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustmentReason?: string;
}

export class DeclarationCommentDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class DeclarationPeriodDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;
}

export class RejectMonthlyDeclarationDto {
  @IsString()
  @MaxLength(1000)
  comment!: string;
}

export class FileMonthlyDeclarationDto {
  @IsString()
  @MaxLength(160)
  filingReference!: string;

  @IsOptional()
  @IsUUID()
  receiptDocumentId?: string;
}
