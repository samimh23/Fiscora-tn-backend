import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtUser } from './auth.types';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtUser }>();
    if (!request.user?.isPlatformAdmin) {
      throw new ForbiddenException(
        'Cet espace est réservé aux administrateurs de la plateforme Fiscora.',
      );
    }
    return true;
  }
}
