import { prisma } from "@/shared/lib/prisma";
import { ADMIN_TARGET_PATHS } from "./admin-access";
import { USER_ROLES, type UserRole } from "./roles";

const CREATE_USER_PATH = "/admin/create-user";

export function isGuardedAdminPath(path: string): boolean {
  return path === CREATE_USER_PATH || ADMIN_TARGET_PATHS.includes(path);
}

function rolesIn(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value)
    ? value.filter((role): role is string => typeof role === "string")
    : [];
}

function dataOf(body: unknown): unknown {
  return typeof body === "object" && body !== null && "data" in body
    ? (body as { data: unknown }).data
    : undefined;
}

function roleOf(body: unknown): unknown {
  return typeof body === "object" && body !== null && "role" in body
    ? (body as { role: unknown }).role
    : undefined;
}

export function requestedRoleOf(body: unknown): string | null {
  const roles = [...rolesIn(roleOf(body)), ...rolesIn(roleOf(dataOf(body)))];
  if (roles.includes(USER_ROLES.SUPERADMIN)) {
    return USER_ROLES.SUPERADMIN;
  }
  return roles[0] ?? null;
}

function coercedField(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return null;
  }
  const value = (body as Record<string, unknown>)[key];
  return value === undefined ? null : String(value);
}

export function roleFromStored(role: string | null | undefined): UserRole {
  const roles = (role ?? "").split(",").map((part) => part.trim());
  if (roles.includes(USER_ROLES.SUPERADMIN)) {
    return USER_ROLES.SUPERADMIN;
  }
  return roles.includes(USER_ROLES.ADMIN) ? USER_ROLES.ADMIN : USER_ROLES.USER;
}

const ROLE_PRIVILEGE: Record<UserRole, number> = {
  [USER_ROLES.USER]: 0,
  [USER_ROLES.ADMIN]: 1,
  [USER_ROLES.SUPERADMIN]: 2,
};

async function roleOfUserId(userId: string | null): Promise<UserRole | null> {
  if (userId === null) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user ? roleFromStored(user.role) : null;
}

async function userIdOfSessionToken(
  sessionToken: string | null,
): Promise<string | null> {
  if (sessionToken === null) {
    return null;
  }
  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    select: { userId: true },
  });
  return session?.userId ?? null;
}

export async function targetRoleOf(body: unknown): Promise<UserRole | null> {
  const roles = [
    await roleOfUserId(coercedField(body, "userId")),
    await roleOfUserId(
      await userIdOfSessionToken(coercedField(body, "sessionToken")),
    ),
  ].filter((role): role is UserRole => role !== null);
  if (roles.length === 0) {
    return null;
  }
  return roles.reduce((highest, role) =>
    ROLE_PRIVILEGE[role] > ROLE_PRIVILEGE[highest] ? role : highest,
  );
}
