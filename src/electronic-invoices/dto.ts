import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TtnEnvironment } from '../database/entities';

export class SaveTtnConfigurationDto {
  @IsEnum(TtnEnvironment)
  environment = TtnEnvironment.Simulation;

  @IsString()
  @MaxLength(100)
  issuerTaxIdentifier!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  schemaVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  certificateReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  connectionReference?: string;

  @IsBoolean()
  isEnabled = true;
}

export class PrepareTtnInvoiceDto {
  @IsUUID()
  invoiceId!: string;
}
