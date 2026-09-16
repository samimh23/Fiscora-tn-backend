import { IsString, Length } from 'class-validator';

export class AskAssistantDto {
  @IsString()
  @Length(3, 2000)
  question!: string;
}
