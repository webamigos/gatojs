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
