"use client";

import { useTranslations } from "next-intl";
import { PasswordTokenForm } from "./password-token-form";

export function ResetPasswordForm() {
  const t = useTranslations("auth");

  return (
    <PasswordTokenForm
      title={t("reset-password-title")}
      description={t("reset-password-description")}
      expiredTitle={t("reset-password-expired-title")}
      expiredDescription={t("reset-password-expired-description")}
    />
  );
}
