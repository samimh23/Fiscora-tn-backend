import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class InvitationDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  roleId!: string;
}

export class UpdateMemberDto {
  @IsUUID()
  roleId!: string;

  @IsBoolean()
  isActive!: boolean;
}

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions!: string[];
}

export class AuditQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  take = 100;
}
