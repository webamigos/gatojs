import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { isOrgRole } from "./roles";

const ROLE_PATHS: ReadonlySet<string> = new Set([
  "/organization/invite-member",
  "/organization/update-member-role",
]);

function readBodyRole(body: unknown): unknown {
  return typeof body === "object" && body !== null
    ? (body as { role?: unknown }).role
    : undefined;
}

export const orgRoleGuardPlugin = {
  id: "gato-org-role-guard",
  hooks: {
    before: [
      {
        matcher: (context) =>
          context.path !== undefined && ROLE_PATHS.has(context.path),
        handler: createAuthMiddleware(async (ctx) => {
          if (!isOrgRole(readBodyRole(ctx.body))) {
            throw new APIError("BAD_REQUEST", {
              message: "Invalid organization role",
            });
          }
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;
