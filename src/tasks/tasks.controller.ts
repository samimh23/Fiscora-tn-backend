import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import {
  AddChecklistItemDto,
  AddTaskCommentDto,
  CreateTaskDto,
  RejectTaskDto,
  TaskQueryDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
  UpdateTaskProgressDto,
} from './dto';
import { TasksService } from './tasks.service';

@ApiTags('Tâches')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get('tasks')
  @RequirePermission(PermissionNames.TasksView)
  listCabinet(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: TaskQueryDto,
  ) {
    return this.service.listCabinet(organizationId, user.userId, query);
  }

  @Get('dossiers/:dossierId/tasks')
  @RequirePermission(PermissionNames.TasksView)
  listDossier(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: TaskQueryDto,
  ) {
    return this.service.listDossier(
      organizationId,
      dossierId,
      user.userId,
      query,
    );
  }

  @Post('dossiers/:dossierId/tasks')
  @RequirePermission(PermissionNames.TasksManage)
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.service.create(organizationId, dossierId, user.userId, dto);
  }

  @Patch('dossiers/:dossierId/tasks/:taskId')
  @RequirePermission(PermissionNames.TasksManage)
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.service.update(
      organizationId,
      dossierId,
      taskId,
      user.userId,
      dto,
    );
  }

  @Patch('dossiers/:dossierId/tasks/:taskId/progress')
  @RequirePermission(PermissionNames.TasksManage)
  progress(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateTaskProgressDto,
  ) {
    return this.service.progress(
      organizationId,
      dossierId,
      taskId,
      user.userId,
      dto,
    );
  }

  @Post('dossiers/:dossierId/tasks/:taskId/complete')
  @RequirePermission(PermissionNames.TasksValidate)
  complete(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.complete(
      organizationId,
      dossierId,
      taskId,
      user.userId,
    );
  }

  @Post('dossiers/:dossierId/tasks/:taskId/reject')
  @RequirePermission(PermissionNames.TasksValidate)
  reject(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectTaskDto,
  ) {
    return this.service.reject(
      organizationId,
      dossierId,
      taskId,
      user.userId,
      dto.comment,
    );
  }

  @Put('dossiers/:dossierId/tasks/:taskId/assignee/:membershipId')
  @RequirePermission(PermissionNames.TasksAssign)
  assign(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.assign(
      organizationId,
      dossierId,
      taskId,
      membershipId,
      user.userId,
    );
  }

  @Post('dossiers/:dossierId/tasks/:taskId/checklist')
  @RequirePermission(PermissionNames.TasksManage)
  addChecklistItem(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AddChecklistItemDto,
  ) {
    return this.service.addChecklistItem(
      organizationId,
      dossierId,
      taskId,
      user.userId,
      dto.label,
    );
  }

  @Patch('dossiers/:dossierId/tasks/:taskId/checklist/:itemId')
  @RequirePermission(PermissionNames.TasksManage)
  updateChecklistItem(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.service.updateChecklistItem(
      organizationId,
      dossierId,
      taskId,
      itemId,
      user.userId,
      dto,
    );
  }

  @Get('dossiers/:dossierId/tasks/:taskId/comments')
  @RequirePermission(PermissionNames.TasksView)
  getComments(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getComments(
      organizationId,
      dossierId,
      taskId,
      user.userId,
    );
  }

  @Post('dossiers/:dossierId/tasks/:taskId/comments')
  @RequirePermission(PermissionNames.TasksManage)
  addComment(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AddTaskCommentDto,
  ) {
    return this.service.addComment(
      organizationId,
      dossierId,
      taskId,
      user.userId,
      dto.body,
    );
  }
}
