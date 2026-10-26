import { Resend } from "resend";
import type { ReactNode } from "react";
import { OrganizationInvitationEmail } from "@/app/emails/organization-invitation-email";
import { PasswordResetEmail } from "@/app/emails/password-reset-email";
import { WelcomeSetPasswordEmail } from "@/app/emails/welcome-set-password-email";
import { project } from "@/shared/config/project";
import { env } from "@/shared/lib/env";
import { logger } from "@/shared/lib/logger";

let resendClient: Resend | null = null;

function getResend(apiKey: string): Resend {
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex < 0) {
    return "***";
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(0, local.length - visible.length))}${domain}`;
}

async function sendTransactionalEmail({
  to,
  subject,
  react,
  logContext,
  fallbackErrorMessage,
}: {
  to: string;
  subject: string;
  react: ReactNode;
  logContext: string;
  fallbackErrorMessage: string;
}) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info("[MAILER] RESEND_API_KEY not set, email not sent", {
      to,
      subject,
    });
    return { data: null };
  }

  try {
    const response = await getResend(apiKey).emails.send({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      react,
    });
    if (response.error) {
      logger.error(logContext, {
        toMasked: maskEmail(to),
        err: response.error,
      });
      return { error: fallbackErrorMessage };
    }
    return { data: response.data };
  } catch (error) {
    logger.error(logContext, {
      toMasked: maskEmail(to),
      err: error,
    });
    return { error: fallbackErrorMessage };
  }
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) {
  return sendTransactionalEmail({
    to,
    subject: "Zresetuj hasło",
    react: PasswordResetEmail({ resetUrl }),
    logContext: "[MAILER] Failed to send password reset email",
    fallbackErrorMessage: "Nie udało się wysłać emaila z resetem hasła",
  });
}

export async function sendWelcomeSetPasswordEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name?: string;
  resetUrl: string;
}) {
  return sendTransactionalEmail({
    to,
    subject: `Witamy w ${project.name}`,
    react: WelcomeSetPasswordEmail({ name, resetUrl }),
    logContext: "[MAILER] Failed to send welcome/set-password email",
    fallbackErrorMessage: "Nie udało się wysłać emaila powitalnego",
  });
}

export async function sendOrganizationInvitationEmail({
  to,
  organizationName,
  inviterName,
  acceptUrl,
}: {
  to: string;
  organizationName: string;
  inviterName?: string;
  acceptUrl: string;
}) {
  return sendTransactionalEmail({
    to,
    subject: `Zaproszenie do ${organizationName}`,
    react: OrganizationInvitationEmail({
      organizationName,
      inviterName,
      acceptUrl,
    }),
    logContext: "[MAILER] Failed to send organization invitation email",
    fallbackErrorMessage: "Nie udało się wysłać zaproszenia do organizacji",
  });
}
