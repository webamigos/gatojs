import { USER_ROLES, type UserRole } from "./roles";

export function canImpersonate(input: {
  actorRole: UserRole;
  targetRole: UserRole;
  adminImpersonation: boolean;
}): boolean {
  if (input.targetRole === USER_ROLES.SUPERADMIN) {
    return false;
  }
  if (input.actorRole === USER_ROLES.SUPERADMIN) {
    return true;
  }
  return (
    input.actorRole === USER_ROLES.ADMIN &&
    input.adminImpersonation &&
    input.targetRole === USER_ROLES.USER
  );
}
