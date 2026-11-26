export const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ORG_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type OrgRole = (typeof ORG_ROLES)[keyof typeof ORG_ROLES];

const ORG_ROLE_VALUES: readonly unknown[] = Object.values(ORG_ROLES);

export function isOrgRole(value: unknown): value is OrgRole {
  return ORG_ROLE_VALUES.includes(value);
}

export function toOrgRole(role: string): OrgRole {
  return isOrgRole(role) ? role : ORG_ROLES.MEMBER;
}

const USER_ROLE_VALUES: readonly unknown[] = Object.values(USER_ROLES);

export function toUserRole(role: unknown): UserRole {
  return USER_ROLE_VALUES.includes(role) ? (role as UserRole) : USER_ROLES.USER;
}

export function isGlobalAdmin(role: unknown): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.SUPERADMIN;
}
