import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ClientApprovalDecision,
  ClientApprovalResourceType,
} from '../database/entities';

export class CreateClientPortalMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class SaveClientApprovalDto {
  @IsEnum(ClientApprovalResourceType)
  resourceType!: ClientApprovalResourceType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  resourceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  version = '1';

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label!: string;

  @IsEnum(ClientApprovalDecision)
  decision!: ClientApprovalDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class SaveClientNotificationPreferencesDto {
  @IsBoolean()
  emailMessages!: boolean;

  @IsBoolean()
  emailDeadlines!: boolean;

  @IsBoolean()
  emailDocuments!: boolean;

  @IsBoolean()
  weeklySummary!: boolean;

  @IsString()
  @IsIn(['fr', 'ar'])
  preferredLanguage!: string;
}
