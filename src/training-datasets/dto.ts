import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TrainingConsentDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  authorizationReference!: string;
}

export class CreateTrainingExportDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset?: number;

  @IsOptional()
  @IsIn(['all', 'invoice', 'bank_statement'])
  documentKind?: 'all' | 'invoice' | 'bank_statement';

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  limit!: number;
}
