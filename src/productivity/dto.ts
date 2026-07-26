import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MemberCompensationType, TimeEntryStatus } from '../database/entities';

const money = /^\d{1,12}(\.\d{1,3})?$/;

export class CreateMemberCostRateDto {
  @IsUUID()
  membershipId!: string;

  @IsEnum(MemberCompensationType)
  compensationType!: MemberCompensationType;

  @Matches(money)
  payRateAmount!: string;

  @Matches(money)
  employerCostRateAmount!: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(44_640)
  monthlyTargetMinutes = 9_600;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class CreateTimeEntryDto {
  @IsDateString()
  workDate!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(1_440)
  durationMinutes!: number;

  @IsBoolean()
  billable = true;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string | null;
}

export class UpdateTimeEntryDto extends PartialType(CreateTimeEntryDto) {}

export enum TimeEntryReviewDecision {
  Approve = 'APPROUVER',
  Reject = 'REJETER',
}

export class ReviewTimeEntryDto {
  @IsEnum(TimeEntryReviewDecision)
  decision!: TimeEntryReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  comment?: string;
}

export class TimeEntryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @IsOptional()
  @IsEnum(TimeEntryStatus)
  status?: TimeEntryStatus;
}

export class ProfitabilityQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
