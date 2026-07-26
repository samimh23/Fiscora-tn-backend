import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const money = /^\d+(\.\d{1,3})?$/;
const rate = /^\d+(\.\d{1,5})?$/;

export class CreateInvoiceDto {
  @IsDateString()
  issueDate!: string;

  @IsDateString()
  dueDate!: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  @Matches(money)
  netAmount!: string;

  @Matches(rate)
  vatRate = '0.19000';

  @Matches(money)
  stampDuty = '1.000';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordPaymentDto {
  @IsDateString()
  paymentDate!: string;

  @Matches(money)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
