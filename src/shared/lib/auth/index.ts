import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getSessionFromCtx,
} from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { authPlugins } from "@/modules.generated";
import {
  enforceSignupPolicy,
  readBodyString,
} from "@/features/auth/services/signup-gate";
import {
  applySignupMembership,
  resolveSignupMembership,
} from "@/features/organizations/services/signup-membership";
import { getDefaultActiveOrganizationId } from "@/features/organizations/services/queries/default-organization-query";
import { trackServiceModeEntry } from "@/features/organizations/services/service-mode-entry";
import { env } from "@/env";
import { emitEvent } from "@/shared/lib/events";
import { prisma } from "@/shared/lib/prisma";
import { createAdminRoles, assertAdminActionAllowed } from "./admin-access";
import {
  isGuardedAdminPath,
  requestedRoleOf,
  roleFromStored,
  targetRoleOf,
} from "./admin-guard";
import { USER_ROLES } from "./roles";
import {
  assertGlobalAdmin,
  requiresGlobalAdminInSingleOrg,
} from "./single-org-guard";
import { eventsPlugin } from "./events-plugin";
import { orgRoleGuardPlugin } from "./org-role-guard-plugin";
import { isInviteSignup } from "./invite-signup-scope";
import { readSignupMembership } from "./signup-membership-context";
import { signupEvents } from "./signup-events";

type UserCreateHooks = NonNullable<
  NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["create"]
>;

const verifyInvitedUserEmail: NonNullable<UserCreateHooks["before"]> = async (
  user,
) =>
  isInviteSignup() ? { data: { ...user, emailVerified: true } } : undefined;

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.APP_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 60 * 60 * 48,
    async sendResetPassword({ user, url }) {
      const mailer = await import("@/shared/lib/mailer");
      await mailer.sendPasswordResetEmail({ to: user.email, resetUrl: url });
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (isGuardedAdminPath(ctx.path)) {
        const session = await getAuthoritativeSessionFromCtx(ctx);
        if (!session && !ctx.request && !ctx.headers) {
          return;
        }
        assertAdminActionAllowed({
          path: ctx.path,
          actorRole: roleFromStored(session?.user.role),
          targetRole: await targetRoleOf(ctx.body),
          requestedRole: requestedRoleOf(ctx.body),
          adminImpersonation: env.ADMIN_IMPERSONATION,
        });
        return;
      }
      if (requiresGlobalAdminInSingleOrg(ctx.path, env.MULTI_ORG)) {
        const session = await getSessionFromCtx(ctx);
        assertGlobalAdmin(session?.user.role);
        return;
      }
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      await enforceSignupPolicy(ctx.body, env.AUTH_PUBLIC_SIGNUP);
      const signupMembership = await resolveSignupMembership({
        multiOrg: env.MULTI_ORG,
        invitationId: readBodyString(ctx.body, "invitationId") ?? null,
        userName: readBodyString(ctx.body, "name") ?? "",
        email: readBodyString(ctx.body, "email"),
      });
      return { context: { signupMembership } };
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: verifyInvitedUserEmail,
        after: async (user, context) => {
          const membership = readSignupMembership(context);
          if (!membership) {
            return;
          }
          const applied = await applySignupMembership(user.id, membership);
          if (isInviteSignup()) {
            return;
          }
          const emits = signupEvents({
            userId: user.id,
            email: user.email,
            membership,
            applied,
          });
          for (const emit of emits) {
            await emitEvent(emit.origin, emit.name, emit.payload);
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await getDefaultActiveOrganizationId(
              session.userId,
            ),
          },
        }),
        after: async (session) => {
          await trackServiceModeEntry(session);
        },
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  plugins: [
    admin({
      defaultRole: USER_ROLES.USER,
      adminRoles: [USER_ROLES.ADMIN, USER_ROLES.SUPERADMIN],
      ...createAdminRoles({ adminImpersonation: env.ADMIN_IMPERSONATION }),
    }),
    organization({
      allowUserToCreateOrganization: async () => env.MULTI_ORG,
      async sendInvitationEmail(data) {
        const mailer = await import("@/shared/lib/mailer");
        await mailer.sendOrganizationInvitationEmail({
          to: data.email,
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name,
          acceptUrl: `${env.APP_URL.replace(/\/$/, "")}/accept-invitation/${data.id}`,
        });
      },
    }),
    orgRoleGuardPlugin,
    eventsPlugin,
    ...authPlugins,
  ],
});
