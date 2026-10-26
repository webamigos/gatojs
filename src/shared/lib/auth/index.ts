import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { authPlugins } from "@/modules.generated";
import { assertSignupAllowed } from "@/features/auth/services/signup-policy";
import { env } from "@/shared/lib/env";
import { prisma } from "@/shared/lib/prisma";
import { isWelcomeSetPasswordUrl } from "./reset-password-routing";
import { USER_ROLES } from "./roles";

async function hasPendingInvitation(
  body: unknown,
  email: string,
): Promise<boolean> {
  const invitationId =
    typeof body === "object" && body !== null && "invitationId" in body
      ? (body as { invitationId: unknown }).invitationId
      : undefined;
  if (typeof invitationId !== "string" || invitationId === "") {
    return false;
  }
  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      email: { equals: email, mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invitation !== null;
}

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
      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      assertSignupAllowed({
        publicSignup: env.AUTH_PUBLIC_SIGNUP,
        hasInvitation:
          typeof email === "string" &&
          (await hasPendingInvitation(ctx.body, email)),
      });
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
