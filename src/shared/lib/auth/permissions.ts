import { clientModules } from "@/modules.client.generated";
import type {
  ModuleDef,
  ModulePermission,
} from "@/shared/lib/modules/define-module";
import { isGlobalAdmin, type OrgRole, type UserRole } from "./roles";

export interface AccessContext {
  userRole: UserRole;
  orgRole: OrgRole | null;
  multiOrg: boolean;
}

export type PermissionContext = Pick<AccessContext, "userRole" | "orgRole">;

export class UnknownPermissionError extends Error {
  name = "UnknownPermissionError";

  constructor(key: string) {
    super(`unknown permission: ${key}`);
  }
}

const registry: readonly ModuleDef[] = clientModules;

function ownsPath(moduleDef: ModuleDef, path: string): boolean {
  return moduleDef.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function moduleForPath(path: string): ModuleDef | null {
  return registry.find((moduleDef) => ownsPath(moduleDef, path)) ?? null;
}

export function moduleByKey(key: string): ModuleDef | null {
  return registry.find((moduleDef) => moduleDef.key === key) ?? null;
}

export function canAccessModule(
  moduleDef: ModuleDef,
  context: AccessContext,
): boolean {
  if (isGlobalAdmin(context.userRole) || moduleDef.public) {
    return true;
  }
  const { orgRole } = context;
  if (orgRole === null) {
    return false;
  }
  if (moduleDef.adminOnly) {
    return (
      context.multiOrg && (moduleDef.multiOrgRoles ?? []).includes(orgRole)
    );
  }
  return !moduleDef.roles || moduleDef.roles.includes(orgRole);
}

export function canAccessPath(path: string, context: AccessContext): boolean {
  if (isGlobalAdmin(context.userRole)) {
    return true;
  }
  const moduleDef = moduleForPath(path);
  return moduleDef !== null && canAccessModule(moduleDef, context);
}

function declaredPermission(key: string): ModulePermission | null {
  for (const moduleDef of registry) {
    const permissions = moduleDef.permissions ?? {};
    if (Object.hasOwn(permissions, key)) {
      return permissions[key] ?? null;
    }
  }
  return null;
}

export function can(context: PermissionContext, key: string): boolean {
  const permission = declaredPermission(key);
  if (permission === null) {
    throw new UnknownPermissionError(key);
  }
  if (isGlobalAdmin(context.userRole)) {
    return true;
  }
  const { orgRole } = context;
  if (orgRole === null) {
    return false;
  }
  return permission.defaultRoles.includes(orgRole);
}
