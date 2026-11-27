"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { legalConfig } from "../legal.config";
import type { LegalConfig } from "../legal-config";
import { openCookieSettings } from "../consent/consent-store";

export function CookieSettingsButton({
  config = legalConfig,
  variant = "link",
  label = "footer",
}: {
  config?: LegalConfig;
  variant?: "link" | "button";
  label?: "footer" | "page";
}): ReactNode {
  const t = useTranslations("legal");
  if (config.cookieCategories.length === 0) {
    return null;
  }
  const text =
    label === "page"
      ? t("change-cookie-settings")
      : t("footer-cookie-settings");
  return (
    <Button
      type="button"
      variant={variant === "button" ? "outline" : "link"}
      size={variant === "button" ? "default" : "sm"}
      className={variant === "link" ? "h-auto p-0 text-muted-foreground" : ""}
      onClick={() => openCookieSettings()}
    >
      {text}
    </Button>
  );
}
