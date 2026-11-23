import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import type { ReactNode } from "react";
import { OrganizationInvitationEmail } from "@/app/emails/organization-invitation-email";
import { PasswordResetEmail } from "@/app/emails/password-reset-email";
import { WelcomeSetPasswordEmail } from "@/app/emails/welcome-set-password-email";
import { project } from "@/shared/config/project";
import { env } from "@/env";
import { logger } from "@/shared/lib/logger";

let resendClient: Resend | null = null;
let smtpTransport: Transporter | null = null;

function getResend(apiKey: string): Resend {
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

function getSmtpTransport(smtpUrl: string): Transporter {
  smtpTransport ??= nodemailer.createTransport(smtpUrl);
  return smtpTransport;
}

type MailMessage = { to: string; subject: string; react: ReactNode };
type MailDelivery = { data: unknown } | { error: unknown };

async function deliverViaSmtp(
  smtpUrl: string,
  message: MailMessage,
): Promise<MailDelivery> {
  const html = await render(message.react);
  const info = await getSmtpTransport(smtpUrl).sendMail({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    html,
  });
  return { data: { id: info.messageId } };
}

async function deliverViaResend(
  apiKey: string,
  message: MailMessage,
): Promise<MailDelivery> {
  const response = await getResend(apiKey).emails.send({
    from: env.EMAIL_FROM,
    to: [message.to],
    subject: message.subject,
    react: message.react,
  });
  return response.error ? { error: response.error } : { data: response.data };
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
  const smtpUrl = env.SMTP_URL;
  const apiKey = env.RESEND_API_KEY;
  if (!smtpUrl && !apiKey) {
    logger.info(
      "[MAILER] SMTP_URL and RESEND_API_KEY not set, email not sent",
      {
        to,
        subject,
      },
    );
    return { data: null };
  }

  const message = { to, subject, react };
  try {
    const delivery = smtpUrl
      ? await deliverViaSmtp(smtpUrl, message)
      : await deliverViaResend(apiKey as string, message);
    if ("error" in delivery) {
      logger.error(logContext, {
        toMasked: maskEmail(to),
        err: delivery.error,
      });
      return { error: fallbackErrorMessage };
    }
    return { data: delivery.data };
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
