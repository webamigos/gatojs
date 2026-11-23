import { betterAuth } from "better-auth";
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
import { localeFromHeaders } from "@/i18n/server-locale";
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
import { readSignupMembership } from "./signup-membership-context";

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
    async sendResetPassword({ user, url }, request) {
      const mailer = await import("@/shared/lib/mailer");
      await mailer.sendPasswordResetEmail({
        to: user.email,
        resetUrl: url,
        locale: localeFromHeaders(request?.headers),
      });
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const locale = localeFromHeaders(ctx.headers ?? ctx.request?.headers);
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
          locale,
        });
        return;
      }
      if (requiresGlobalAdminInSingleOrg(ctx.path, env.MULTI_ORG)) {
        const session = await getSessionFromCtx(ctx);
        assertGlobalAdmin(session?.user.role, locale);
        return;
      }
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      await enforceSignupPolicy(ctx.body, env.AUTH_PUBLIC_SIGNUP, locale);
      const signupMembership = await resolveSignupMembership({
        multiOrg: env.MULTI_ORG,
        invitationId: readBodyString(ctx.body, "invitationId") ?? null,
        userName: readBodyString(ctx.body, "name") ?? "",
        email: readBodyString(ctx.body, "email"),
        locale,
      });
      return { context: { signupMembership } };
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          const membership = readSignupMembership(context);
          if (!membership) {
            return;
          }
          await applySignupMembership(user.id, membership);
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
      async sendInvitationEmail(data, request) {
        const mailer = await import("@/shared/lib/mailer");
        await mailer.sendOrganizationInvitationEmail({
          to: data.email,
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name,
          acceptUrl: `${env.APP_URL.replace(/\/$/, "")}/accept-invitation/${data.id}`,
          locale: localeFromHeaders(request?.headers),
        });
      },
    }),
    ...authPlugins,
  ],
});
