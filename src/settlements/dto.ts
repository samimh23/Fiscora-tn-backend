import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentDirection, ThirdPartyType } from '../database/entities';

const money = /^\d+(\.\d{1,3})?$/;

export class CreateThirdPartyDto {
  @IsEnum(ThirdPartyType)
  type!: ThirdPartyType;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxIdentifier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUUID()
  receivableAccountId?: string;

  @IsOptional()
  @IsUUID()
  payableAccountId?: string;
}

export class PaymentAllocationDto {
  @IsUUID()
  invoiceId!: string;

  @Matches(money)
  amount!: string;
}

export class CreateThirdPartyPaymentDto {
  @IsUUID()
  thirdPartyId!: string;

  @IsEnum(PaymentDirection)
  direction!: PaymentDirection;

  @IsDateString()
  paymentDate!: string;

  @Matches(money)
  amount!: string;

  @IsString()
  @MaxLength(50)
  method!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsUUID()
  journalId!: string;

  @IsUUID()
  cashAccountId!: string;

  @IsUUID()
  thirdPartyAccountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}
