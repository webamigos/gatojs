import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import type { ReactNode } from "react";
import { OrganizationInvitationEmail } from "@/app/emails/organization-invitation-email";
import { PasswordResetEmail } from "@/app/emails/password-reset-email";
import { WelcomeSetPasswordEmail } from "@/app/emails/welcome-set-password-email";
import { project } from "@/shared/config/project";
import type { AppLocale } from "@/i18n/config";
import { loadCoreMessages } from "@/i18n/load-messages";
import { translatorFor, type Translate } from "@/i18n/translator";
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

async function emailTranslator(locale: AppLocale): Promise<Translate> {
  return translatorFor(locale, await loadCoreMessages(locale), "emails");
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  locale,
}: {
  to: string;
  resetUrl: string;
  locale: AppLocale;
}) {
  const t = await emailTranslator(locale);
  const subject = t("passwordReset.subject");
  return sendTransactionalEmail({
    to,
    subject,
    react: PasswordResetEmail({
      resetUrl,
      text: {
        preview: subject,
        intro: t("passwordReset.intro"),
        instruction: t("passwordReset.instruction"),
        cta: t("passwordReset.cta"),
        footer: t("passwordReset.footer"),
      },
    }),
    logContext: "[MAILER] Failed to send password reset email",
    fallbackErrorMessage: "Failed to send password reset email",
  });
}

export async function sendWelcomeSetPasswordEmail({
  to,
  name,
  resetUrl,
  locale,
}: {
  to: string;
  name?: string;
  resetUrl: string;
  locale: AppLocale;
}) {
  const t = await emailTranslator(locale);
  const subject = t("welcome.subject", { appName: project.name });
  return sendTransactionalEmail({
    to,
    subject,
    react: WelcomeSetPasswordEmail({
      resetUrl,
      text: {
        preview: subject,
        greeting: name
          ? t("welcome.greeting", { name })
          : t("welcome.greetingNoName"),
        body: t("welcome.body", { appName: project.name }),
        cta: t("welcome.cta"),
        footer: t("welcome.footer"),
      },
    }),
    logContext: "[MAILER] Failed to send welcome/set-password email",
    fallbackErrorMessage: "Failed to send welcome email",
  });
}

export async function sendOrganizationInvitationEmail({
  to,
  organizationName,
  inviterName,
  acceptUrl,
  locale,
}: {
  to: string;
  organizationName: string;
  inviterName?: string;
  acceptUrl: string;
  locale: AppLocale;
}) {
  const t = await emailTranslator(locale);
  const subject = t("invitation.subject", { organizationName });
  return sendTransactionalEmail({
    to,
    subject,
    react: OrganizationInvitationEmail({
      acceptUrl,
      text: {
        preview: subject,
        greeting: t("invitation.greeting"),
        body: inviterName
          ? t("invitation.bodyWithInviter", { inviterName, organizationName })
          : t("invitation.body", { organizationName }),
        cta: t("invitation.cta"),
        footer: t("invitation.footer"),
      },
    }),
    logContext: "[MAILER] Failed to send organization invitation email",
    fallbackErrorMessage: "Failed to send organization invitation email",
  });
}
