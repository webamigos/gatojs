"use client";

import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { useServiceMode } from "./service-mode-provider";

export function ServiceModeBanner() {
  const { active, organizationName } = useServiceMode();

  if (!active) {
    return null;
  }

  return <ActiveServiceModeBanner organizationName={organizationName} />;
}

function ActiveServiceModeBanner({
  organizationName,
}: {
  organizationName: string;
}) {
  const t = useTranslations("serviceMode");

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-3 border-b border-warning/30 bg-[color-mix(in_oklch,var(--warning)_15%,transparent)] px-4 py-2 text-sm font-medium text-warning"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>{t("banner", { name: organizationName })}</span>
    </div>
  );
}
