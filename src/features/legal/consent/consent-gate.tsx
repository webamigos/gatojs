"use client";

import type { ReactNode } from "react";
import type { CookieCategory, LegalConfig } from "../legal-config";
import { useCookieConsent } from "./use-cookie-consent";

export function ConsentGate({
  category,
  config,
  fallback = null,
  children,
}: {
  category: CookieCategory;
  config?: LegalConfig;
  fallback?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const consent = useCookieConsent(config);
  return consent.hasConsent(category) ? children : fallback;
}
