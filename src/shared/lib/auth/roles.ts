export const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ORG_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type OrgRole = (typeof ORG_ROLES)[keyof typeof ORG_ROLES];

const ORG_ROLE_VALUES: readonly string[] = Object.values(ORG_ROLES);

export function toOrgRole(role: string): OrgRole {
  return ORG_ROLE_VALUES.includes(role) ? (role as OrgRole) : ORG_ROLES.MEMBER;
}

export function toUserRole(role: unknown): UserRole {
  return role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.USER;
}
