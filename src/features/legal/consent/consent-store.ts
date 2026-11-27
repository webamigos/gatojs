import { legalConfig } from "../legal.config";
import type { CookieCategory, LegalConfig } from "../legal-config";
import {
  consentCookieString,
  consentCookieValue,
  decide,
  isGranted,
  parseConsent,
  type ConsentChoices,
  type ConsentRecord,
} from "./consent-record";

const consentListeners = new Set<(record: ConsentRecord | null) => void>();
const storeListeners = new Set<() => void>();
const settingsListeners = new Set<() => void>();

let cachedRaw: string | undefined;
let cachedRecord: ConsentRecord | null = null;

function hasDocument(): boolean {
  return typeof document !== "undefined";
}

function rawConsentCookie(): string | undefined {
  if (!hasDocument()) {
    return undefined;
  }
  return consentCookieValue(document.cookie);
}

export function consentSnapshot(): ConsentRecord | null {
  const raw = rawConsentCookie();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecord = parseConsent(raw);
  }
  return cachedRecord;
}

export function readConsent(): ConsentRecord | null {
  return parseConsent(rawConsentCookie());
}

export function writeConsent(
  choices: ConsentChoices,
  config: LegalConfig = legalConfig,
  now: number = Math.floor(Date.now() / 1000),
): ConsentRecord {
  const record = decide(config, choices, now);
  if (hasDocument()) {
    document.cookie = consentCookieString(record, {
      secure: window.location.protocol === "https:",
    });
  }
  for (const listener of [...storeListeners]) {
    listener();
  }
  for (const listener of [...consentListeners]) {
    listener(record);
  }
  return record;
}

export function hasConsent(
  category: CookieCategory,
  config: LegalConfig = legalConfig,
): boolean {
  return isGranted(readConsent(), category, config);
}

export function onConsentChange(
  listener: (record: ConsentRecord | null) => void,
): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

export function openCookieSettings(): void {
  for (const listener of [...settingsListeners]) {
    listener();
  }
}

export function onOpenCookieSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

export function subscribeConsent(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}
