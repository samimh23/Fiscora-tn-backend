import {
  Body,
  Controller,
  Param,
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
import { AskAssistantDto } from './assistant.dto';
import { AssistantService } from './assistant.service';

@ApiTags('Assistant Fiscora')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@RequirePermission(PermissionNames.DocumentsValidate)
@Controller('api/organizations/:organizationId/dossiers/:dossierId/assistant')
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Post('reindex')
  reindex(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reindex(organizationId, dossierId, user.userId);
  }

  @Post('ask')
  ask(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AskAssistantDto,
  ) {
    return this.service.ask(
      organizationId,
      dossierId,
      user.userId,
      dto.question,
    );
  }
}

@ApiTags('Assistant Fiscora')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@RequirePermission(PermissionNames.OrganizationView)
@Controller('api/organizations/:organizationId/assistant')
export class ContextualAssistantController {
  constructor(private readonly service: AssistantService) {}

  @Post('ask')
  ask(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AskAssistantDto,
  ) {
    return this.service.askContextual(
      organizationId,
      user.userId,
      dto.question,
      dto.currentPath,
      dto.dossierId,
    );
  }
}
