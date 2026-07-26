import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WorkTaskPriority, WorkTaskStatus } from '../database/entities';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsDateString()
  dueOn!: string;

  @IsEnum(WorkTaskPriority)
  priority!: WorkTaskPriority;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  checklist?: string[];
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

export class TaskQueryDto {
  @IsOptional()
  @IsEnum(WorkTaskStatus)
  status?: WorkTaskStatus;

  @IsOptional()
  @IsEnum(WorkTaskPriority)
  priority?: WorkTaskPriority;

  @IsOptional()
  @IsUUID()
  assigneeMembershipId?: string;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class UpdateTaskProgressDto {
  @IsEnum(WorkTaskStatus)
  status!: WorkTaskStatus.InProgress | WorkTaskStatus.ReadyForReview;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string | null;
}

export class RejectTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comment!: string;
}

export class AddChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  label!: string;
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export class AddTaskCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  body!: string;
}
