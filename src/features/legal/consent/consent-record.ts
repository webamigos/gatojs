import { consentCookieSchema } from "../contracts/consent.schemas";
import { type CookieCategory, type LegalConfig } from "../legal-config";

export const CONSENT_COOKIE_NAME = "cookie_consent";

export const CONSENT_MAX_AGE_SECONDS = 15552000;

export type ConsentChoices = Partial<Record<CookieCategory, boolean>>;

export interface ConsentRecord {
  version: number;
  choices: ConsentChoices;
  decidedAt: number;
}

function decodeJson(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return undefined;
  }
}

export function parseConsent(
  raw: string | null | undefined,
): ConsentRecord | null {
  if (!raw) {
    return null;
  }
  const parsed = consentCookieSchema.safeParse(decodeJson(raw));
  if (!parsed.success) {
    return null;
  }
  const { v: version, c: choices, t: decidedAt } = parsed.data;
  return { version, choices, decidedAt };
}

export function serializeConsent(record: ConsentRecord): string {
  return encodeURIComponent(
    JSON.stringify({
      v: record.version,
      c: record.choices,
      t: record.decidedAt,
    }),
  );
}

export function consentCookieValue(cookieHeader: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const pair = part.trim();
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (pair.slice(0, separator) === CONSENT_COOKIE_NAME) {
      return pair.slice(separator + 1);
    }
  }
  return undefined;
}

export function consentCookieString(
  record: ConsentRecord,
  options: { secure: boolean },
): string {
  const attributes = [
    `${CONSENT_COOKIE_NAME}=${serializeConsent(record)}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  if (options.secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

export function isConsentValid(
  record: ConsentRecord | null,
  config: LegalConfig,
): boolean {
  if (record === null || record.version !== config.consentVersion) {
    return false;
  }
  return config.cookieCategories.every(
    (category) => typeof record.choices[category] === "boolean",
  );
}

export function needsChoice(
  record: ConsentRecord | null,
  config: LegalConfig,
): boolean {
  return config.cookieCategories.length > 0 && !isConsentValid(record, config);
}

export function isGranted(
  record: ConsentRecord | null,
  category: CookieCategory,
  config: LegalConfig,
): boolean {
  if (!config.cookieCategories.includes(category)) {
    return false;
  }
  if (!isConsentValid(record, config)) {
    return false;
  }
  return record?.choices[category] === true;
}

export function decide(
  config: LegalConfig,
  choices: ConsentChoices,
  now: number,
): ConsentRecord {
  const decided: ConsentChoices = {};
  for (const category of config.cookieCategories) {
    decided[category] = choices[category] === true;
  }
  return { version: config.consentVersion, choices: decided, decidedAt: now };
}

export function allChoices(
  config: LegalConfig,
  value: boolean,
): ConsentChoices {
  const choices: ConsentChoices = {};
  for (const category of config.cookieCategories) {
    choices[category] = value;
  }
  return choices;
}
