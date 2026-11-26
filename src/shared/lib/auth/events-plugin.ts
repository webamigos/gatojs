import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { emitEvent } from "@/shared/lib/events/emit-event";
import { logger } from "@/shared/lib/logger";
import {
  ORGANIZATION_EVENT_PATHS,
  organizationEvents,
  readMember,
  type OrganizationEventEmit,
  type PreviousMemberRole,
} from "./organization-events";

const UPDATE_MEMBER_ROLE_PATH = "/organization/update-member-role";

function readBodyMemberId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { memberId } = body as { memberId?: unknown };
  return typeof memberId === "string" ? memberId : null;
}

function readPreviousMemberRole(
  context: unknown,
): PreviousMemberRole | undefined {
  if (typeof context !== "object" || context === null) {
    return undefined;
  }
  const { previousMemberRole } = context as { previousMemberRole?: unknown };
  return typeof previousMemberRole === "object" && previousMemberRole !== null
    ? (previousMemberRole as PreviousMemberRole)
    : undefined;
}

async function emitLogged(
  path: string,
  emit: OrganizationEventEmit,
): Promise<void> {
  try {
    await emitEvent(emit.origin, emit.name, emit.payload);
  } catch (error) {
    logger.error("Auth event failed", { path, event: emit.name, error });
  }
}

function logSkippedRoleChange(path: string, returned: unknown): void {
  const member = readMember(returned);
  if (path === UPDATE_MEMBER_ROLE_PATH && member) {
    logger.error("Auth event skipped", {
      path,
      memberId: member.id,
      reason: "previous role unknown",
    });
  }
}

export const eventsPlugin = {
  id: "gato-events",
  hooks: {
    before: [
      {
        matcher: (context) => context.path === UPDATE_MEMBER_ROLE_PATH,
        handler: createAuthMiddleware(async (ctx) => {
          const memberId = readBodyMemberId(ctx.body);
          if (memberId === null) {
            return;
          }
          const member = await ctx.context.adapter.findOne<{ role: string }>({
            model: "member",
            where: [{ field: "id", value: memberId }],
          });
          if (!member) {
            return;
          }
          return {
            context: {
              previousMemberRole: { memberId, role: member.role },
            },
          };
        }),
      },
    ],
    after: [
      {
        matcher: (context) => ORGANIZATION_EVENT_PATHS.has(context.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          const returned = ctx.context.returned;
          const emits = organizationEvents({
            path: ctx.path,
            actorUserId: session?.user.id ?? null,
            returned,
            previousRole: readPreviousMemberRole(ctx),
          });
          if (emits.length === 0) {
            logSkippedRoleChange(ctx.path, returned);
            return;
          }
          for (const emit of emits) {
            await emitLogged(ctx.path, emit);
          }
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;
