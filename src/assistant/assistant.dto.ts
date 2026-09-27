import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class AskAssistantDto {
  @IsString()
  @Length(3, 2000)
  question!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentPath?: string;

  @IsOptional()
  @IsUUID()
  dossierId?: string;

  @IsOptional()
  @IsDateString()
  conversationStartedAt?: string;
}

export class AssistantHistoryQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsDateString()
  after?: string;

  @ValidateIf(
    (dto: AssistantHistoryQueryDto, value: unknown) =>
      value !== undefined || dto.beforeId !== undefined,
  )
  @IsDateString()
  beforeCreatedAt?: string;

  @ValidateIf(
    (dto: AssistantHistoryQueryDto, value: unknown) =>
      value !== undefined || dto.beforeCreatedAt !== undefined,
  )
  @IsUUID()
  beforeId?: string;
}
