import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
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
import { env } from "@/shared/lib/env";
import { prisma } from "@/shared/lib/prisma";
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
    async sendResetPassword({ user, url }) {
      const mailer = await import("@/shared/lib/mailer");
      await mailer.sendPasswordResetEmail({ to: user.email, resetUrl: url });
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
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
      adminRoles: [USER_ROLES.ADMIN],
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
    ...authPlugins,
  ],
});
