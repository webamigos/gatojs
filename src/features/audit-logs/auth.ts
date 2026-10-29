import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { trackAudit } from "@/shared/lib/audit";
import {
  AUDITED_ORGANIZATION_PATHS,
  organizationAuditEvent,
} from "./services/organization-audit-events";

const UPDATE_MEMBER_ROLE_PATH = "/organization/update-member-role";

function readMemberId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { memberId } = body as { memberId?: unknown };
  return typeof memberId === "string" ? memberId : null;
}

function readPreviousRole(context: unknown): string | undefined {
  if (typeof context !== "object" || context === null) {
    return undefined;
  }
  const { auditPreviousRole } = context as { auditPreviousRole?: unknown };
  return typeof auditPreviousRole === "string" ? auditPreviousRole : undefined;
}

export const authPlugin = {
  id: "audit-logs",
  hooks: {
    before: [
      {
        matcher: (context) => context.path === UPDATE_MEMBER_ROLE_PATH,
        handler: createAuthMiddleware(async (ctx) => {
          const memberId = readMemberId(ctx.body);
          if (!memberId) {
            return;
          }
          const member = await ctx.context.adapter.findOne<{ role: string }>({
            model: "member",
            where: [{ field: "id", value: memberId }],
          });
          return { context: { auditPreviousRole: member?.role } };
        }),
      },
    ],
    after: [
      {
        matcher: (context) =>
          AUDITED_ORGANIZATION_PATHS.has(context.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          const event = organizationAuditEvent({
            path: ctx.path,
            actorUserId: session?.user.id ?? null,
            body: ctx.body,
            returned: ctx.context.returned,
            previousRole: readPreviousRole(ctx),
          });
          if (event) {
            await trackAudit(event);
          }
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;
