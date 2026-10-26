import { z } from "zod";
import { ORG_ROLES } from "@/shared/lib/auth/roles";

export const inviteUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum([ORG_ROLES.ADMIN, ORG_ROLES.MEMBER]).default(ORG_ROLES.MEMBER),
});

export type InviteUserValues = z.infer<typeof inviteUserSchema>;
