import { APIError } from "better-auth/api";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { canImpersonate } from "./impersonation-policy";
import { USER_ROLES, type UserRole } from "./roles";

export const IMPERSONATE_PATH = "/admin/impersonate-user";

export const ADMIN_TARGET_PATHS: readonly string[] = [
  "/admin/set-role",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/update-user",
  IMPERSONATE_PATH,
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/list-user-sessions",
];

const ADMIN_USER_ACTIONS = [
  "create",
  "list",
  "set-role",
  "ban",
  "delete",
  "set-password",
  "set-email",
  "get",
  "update",
] as const;

export function createAdminRoles(options: { adminImpersonation: boolean }) {
  const ac = createAccessControl(defaultStatements);
  const adminUserActions = options.adminImpersonation
    ? [...ADMIN_USER_ACTIONS, "impersonate" as const]
    : [...ADMIN_USER_ACTIONS];
  return {
    ac,
    roles: {
      [USER_ROLES.USER]: ac.newRole({ user: [], session: [] }),
      [USER_ROLES.ADMIN]: ac.newRole({
        user: adminUserActions,
        session: ["list", "revoke", "delete"],
      }),
      [USER_ROLES.SUPERADMIN]: ac.newRole({
        user: [...defaultStatements.user],
        session: [...defaultStatements.session],
      }),
    },
  };
}

function forbidden(message: string): never {
  throw new APIError("FORBIDDEN", { message });
}

export function assertAdminActionAllowed(input: {
  path: string;
  actorRole: UserRole;
  targetRole: UserRole | null;
  requestedRole: string | null;
  adminImpersonation: boolean;
}): void {
  const actorIsSuperadmin = input.actorRole === USER_ROLES.SUPERADMIN;
  if (!actorIsSuperadmin && input.requestedRole === USER_ROLES.SUPERADMIN) {
    forbidden("Rolę superadmin może nadać tylko superadmin");
  }
  if (input.path === IMPERSONATE_PATH) {
    if (
      input.targetRole === null ||
      !canImpersonate({
        actorRole: input.actorRole,
        targetRole: input.targetRole,
        adminImpersonation: input.adminImpersonation,
      })
    ) {
      forbidden("Brak uprawnień do podszycia się pod tego użytkownika");
    }
    return;
  }
  if (actorIsSuperadmin) {
    return;
  }
  if (input.targetRole === USER_ROLES.SUPERADMIN) {
    forbidden("Konto serwisowe może zmieniać tylko superadmin");
  }
  if (input.targetRole === null && ADMIN_TARGET_PATHS.includes(input.path)) {
    forbidden("Brak uprawnień do tego konta");
  }
}
