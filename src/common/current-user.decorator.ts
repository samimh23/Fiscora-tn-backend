import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtUser }>();
    return request.user;
  },
);
