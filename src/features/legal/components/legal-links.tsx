"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/shared/lib/utils";
import { legalSettings } from "../legal-settings";
import type { LegalConfig } from "../legal-config";
import { CookieSettingsButton } from "./cookie-settings-button";

const linkClass =
  "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

export function LegalLinks({
  config = legalSettings.config,
  className,
}: {
  config?: LegalConfig;
  className?: string;
}): ReactNode {
  const t = useTranslations("legal");
  return (
    <nav
      aria-label={t("footer-label")}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs",
        className,
      )}
    >
      <Link href="/terms" className={linkClass}>
        {t("footer-terms")}
      </Link>
      <Link href="/privacy" className={linkClass}>
        {t("footer-privacy")}
      </Link>
      <CookieSettingsButton config={config} label="footer" />
    </nav>
  );
}
