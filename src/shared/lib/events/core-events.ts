import { z } from "zod";
import { ORG_ROLES } from "@/shared/lib/auth/roles";
import { defineEvents } from "./define-events";

const orgRole = z.enum([ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER]);

export const coreEvents = defineEvents({
  "organizations.created": z.object({
    name: z.string(),
    slug: z.string(),
    ownerUserId: z.string(),
  }),
  "organizations.member-added": z.object({
    memberId: z.string(),
    userId: z.string(),
    role: orgRole,
  }),
  "organizations.member-removed": z.object({
    memberId: z.string(),
    userId: z.string(),
  }),
  "organizations.member-role-changed": z.object({
    memberId: z.string(),
    userId: z.string(),
    previousRole: orgRole,
    role: orgRole,
  }),
  "users.invited": z.object({
    invitationId: z.string(),
    email: z.string(),
    role: orgRole,
  }),
  "users.invitation-accepted": z.object({
    invitationId: z.string(),
    userId: z.string(),
  }),
  "users.invitation-canceled": z.object({
    invitationId: z.string(),
  }),
  "auth.signed-up": z.object({
    userId: z.string(),
    email: z.string(),
  }),
});
