import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { authPlugins } from "@/modules.generated";
import { enforceSignupPolicy } from "@/features/auth/services/signup-gate";
import { env } from "@/shared/lib/env";
import { prisma } from "@/shared/lib/prisma";
import { isWelcomeSetPasswordUrl } from "./reset-password-routing";
import { USER_ROLES } from "./roles";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 60 * 60 * 48,
    async sendResetPassword({ user, url }) {
      const mailer = await import("@/shared/lib/mailer");
      if (isWelcomeSetPasswordUrl(url)) {
        await mailer.sendWelcomeSetPasswordEmail({
          to: user.email,
          name: user.name,
          resetUrl: url,
        });
        return;
      }
      await mailer.sendPasswordResetEmail({ to: user.email, resetUrl: url });
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      await enforceSignupPolicy(ctx.body, env.AUTH_PUBLIC_SIGNUP);
    }),
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
      async sendInvitationEmail(data) {
        const mailer = await import("@/shared/lib/mailer");
        await mailer.sendOrganizationInvitationEmail({
          to: data.email,
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name,
          acceptUrl: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/accept-invitation/${data.id}`,
        });
      },
    }),
    ...authPlugins,
  ],
});
