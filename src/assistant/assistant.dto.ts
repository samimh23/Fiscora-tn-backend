import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

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
}
