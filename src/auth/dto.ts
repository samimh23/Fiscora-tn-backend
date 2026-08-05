import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Administrateur Démo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ example: 'admin@demo.fr' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'MotDePasse123' })
  @IsString()
  @MinLength(10)
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir une majuscule.' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir une minuscule.' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir un chiffre.' })
  password!: string;

  @ApiProperty({ example: 'Cabinet Démo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationName!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class RevokeTokenDto extends RefreshDto {}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir une majuscule.' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir une minuscule.' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir un chiffre.' })
  newPassword!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(10)
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir une majuscule.' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir une minuscule.' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir un chiffre.' })
  newPassword!: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;

  @IsString()
  @MinLength(10)
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir une majuscule.' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir une minuscule.' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir un chiffre.' })
  password!: string;
}
