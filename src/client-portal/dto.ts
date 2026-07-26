import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientPortalMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
