"use client";

import { useSyncExternalStore } from "react";
import { legalConfig } from "../legal.config";
import type { CookieCategory, LegalConfig } from "../legal-config";
import {
  allChoices,
  isConsentValid,
  isGranted,
  type ConsentChoices,
} from "./consent-record";
import {
  consentSnapshot,
  openCookieSettings,
  subscribeConsent,
  writeConsent,
} from "./consent-store";

export interface CookieConsentState {
  ready: boolean;
  categories: readonly CookieCategory[];
  choices: ConsentChoices;
  needsChoice: boolean;
  hasConsent(category: CookieCategory): boolean;
  acceptAll(): void;
  rejectAll(): void;
  save(choices: ConsentChoices): void;
  openSettings(): void;
}

function subscribeToNothing(): () => void {
  return () => {};
}

function clientIsReady(): boolean {
  return true;
}

function serverIsNotReady(): boolean {
  return false;
}

function noServerRecord(): null {
  return null;
}

export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    clientIsReady,
    serverIsNotReady,
  );
}

export function useCookieConsent(
  config: LegalConfig = legalConfig,
): CookieConsentState {
  const ready = useIsClient();
  const record = useSyncExternalStore(
    subscribeConsent,
    consentSnapshot,
    noServerRecord,
  );
  const valid = ready && isConsentValid(record, config);

  return {
    ready,
    categories: config.cookieCategories,
    choices: valid && record !== null ? record.choices : {},
    needsChoice: ready && config.cookieCategories.length > 0 && !valid,
    hasConsent: (category) => ready && isGranted(record, category, config),
    acceptAll: () => {
      writeConsent(allChoices(config, true), config);
    },
    rejectAll: () => {
      writeConsent(allChoices(config, false), config);
    },
    save: (choices) => {
      writeConsent(choices, config);
    },
    openSettings: openCookieSettings,
  };
}
