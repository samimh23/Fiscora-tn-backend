import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { CreateEmployeeDto, GeneratePayrollDto } from './dto';
import { PayrollService } from './payroll.service';

@ApiTags('Paie et CNSS')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers/:dossierId')
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Get('employees')
  @RequirePermission(PermissionNames.PayrollView)
  employees(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listEmployees(organizationId, dossierId, user.userId);
  }

  @Post('employees')
  @RequirePermission(PermissionNames.PayrollManage)
  createEmployee(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.service.createEmployee(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Get('payroll-runs')
  @RequirePermission(PermissionNames.PayrollView)
  runs(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listRuns(organizationId, dossierId, user.userId);
  }

  @Post('payroll-runs')
  @RequirePermission(PermissionNames.PayrollManage)
  generate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: GeneratePayrollDto,
  ) {
    return this.service.generate(organizationId, dossierId, user.userId, dto);
  }

  @Post('payroll-runs/:runId/validate')
  @RequirePermission(PermissionNames.PayrollValidate)
  validate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.validate(organizationId, dossierId, runId, user.userId);
  }

  @Get('payroll/cnss/:year/:quarter')
  @RequirePermission(PermissionNames.PayrollView)
  cnss(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('quarter', ParseIntPipe) quarter: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.cnssQuarter(
      organizationId,
      dossierId,
      user.userId,
      year,
      quarter,
    );
  }
}
