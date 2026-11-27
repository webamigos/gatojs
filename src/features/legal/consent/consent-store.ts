import { legalConfig } from "../legal.config";
import { DEFAULT_CONSENT_MAX_AGE_DAYS } from "../contracts/legal-config.schemas";
import type { CookieCategory, LegalConfig } from "../legal-config";
import {
  CONSENT_COOKIE_NAME,
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

const SECONDS_PER_DAY = 86400;

interface CachedSnapshot {
  raw: string | undefined;
  record: ConsentRecord | null;
}

const snapshotsByName = new Map<string, CachedSnapshot>();

function hasDocument(): boolean {
  return typeof document !== "undefined";
}

function cookieName(config: LegalConfig): string {
  return config.consentCookieName ?? CONSENT_COOKIE_NAME;
}

function maxAgeSeconds(config: LegalConfig): number {
  return (
    (config.consentMaxAgeDays ?? DEFAULT_CONSENT_MAX_AGE_DAYS) * SECONDS_PER_DAY
  );
}

function rawConsentCookie(config: LegalConfig): string | undefined {
  if (!hasDocument()) {
    return undefined;
  }
  return consentCookieValue(document.cookie, cookieName(config));
}

export function consentSnapshot(
  config: LegalConfig = legalConfig,
): ConsentRecord | null {
  const name = cookieName(config);
  const raw = rawConsentCookie(config);
  const cached = snapshotsByName.get(name);
  if (cached !== undefined && cached.raw === raw) {
    return cached.record;
  }
  const record = parseConsent(raw);
  snapshotsByName.set(name, { raw, record });
  return record;
}

export function readConsent(
  config: LegalConfig = legalConfig,
): ConsentRecord | null {
  return parseConsent(rawConsentCookie(config));
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
      name: cookieName(config),
      maxAgeSeconds: maxAgeSeconds(config),
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
  return isGranted(readConsent(config), category, config);
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
