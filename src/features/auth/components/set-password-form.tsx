"use client";

import { useTranslations } from "next-intl";
import { PasswordTokenForm } from "./password-token-form";

export function SetPasswordForm() {
  const t = useTranslations("auth");

  return (
    <PasswordTokenForm
      title={t("set-password-title")}
      description={t("set-password-description")}
      expiredTitle={t("set-password-expired-title")}
      expiredDescription={t("set-password-expired-description")}
    />
  );
}
