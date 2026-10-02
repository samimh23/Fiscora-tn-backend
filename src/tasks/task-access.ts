import { PermissionNames } from '../database/permissions';

/** Assignment and review permissions identify managers, not dossier membership. */
export function canAccessAllTasks(permissions: ReadonlySet<string>): boolean {
  return (
    permissions.has(PermissionNames.TasksAssign) ||
    permissions.has(PermissionNames.TasksValidate)
  );
}
