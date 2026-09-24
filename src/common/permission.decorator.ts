import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);
export const RequireAllPermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
