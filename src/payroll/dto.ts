import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const money = /^\d+(\.\d{1,3})?$/;
const rate = /^\d+(\.\d{1,5})?$/;

export class CreateEmployeeDto {
  @IsString()
  @MaxLength(180)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cnssNumber?: string;

  @IsDateString()
  hireDate!: string;

  @IsString()
  @MaxLength(50)
  contractType!: string;

  @Matches(money)
  grossSalary!: string;

  @IsBoolean()
  isHigherEducationGraduate = false;

  @IsBoolean()
  employerSupportEligible = false;

  @IsOptional()
  @IsDateString()
  employerSupportStartDate?: string;
}

export class GeneratePayrollDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @IsOptional()
  @Matches(rate)
  employeeRate?: string;

  @IsOptional()
  @Matches(rate)
  employerRate?: string;

  @IsOptional()
  @Matches(rate)
  incomeTaxRate?: string;
}
