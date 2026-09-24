import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { OrganizationMembership } from '../database/entities';
import type { JwtUser } from './auth.types';
import { PERMISSION_KEY } from './permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | string[]>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user: JwtUser; params: { organizationId?: string } }
      >();
    const organizationId = request.params.organizationId;
    if (!organizationId)
      throw new ForbiddenException('Organisation absente de la requête.');

    const membership = await this.memberships.findOne({
      where: {
        organizationId,
        userId: request.user.userId,
        isActive: true,
        organization: { isActive: true },
      },
      relations: { organization: true, role: { rolePermissions: true } },
    });
    const requiredPermissions = Array.isArray(required) ? required : [required];
    const grantedPermissions = new Set(
      membership?.role.rolePermissions.map((item) => item.permissionName) ?? [],
    );
    if (
      !membership ||
      !requiredPermissions.every((permission) =>
        grantedPermissions.has(permission),
      )
    ) {
      throw new ForbiddenException(
        'Vous ne disposez pas de la permission nécessaire.',
      );
    }
    return true;
  }
}
