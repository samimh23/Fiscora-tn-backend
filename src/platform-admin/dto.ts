import { IsBoolean, IsEmail, IsString, Length } from 'class-validator';

export class UpdatePlatformStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @Length(8, 500)
  reason!: string;
}

export class RevokePlatformSessionsDto {
  @IsString()
  @Length(8, 500)
  reason!: string;
}

export class SendPlatformTestEmailDto {
  @IsEmail()
  recipient!: string;
}
