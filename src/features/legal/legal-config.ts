import type { z } from "zod";
import {
  COOKIE_CATEGORIES,
  DEFAULT_CONSENT_COOKIE_NAME,
  DEFAULT_CONSENT_MAX_AGE_DAYS,
  isCookieCategory,
  legalConfigSchema,
  type CookieCategory,
} from "./contracts/legal-config.schemas";

export { COOKIE_CATEGORIES, isCookieCategory, type CookieCategory };

export interface LegalConfig {
  readonly cookieCategories: readonly CookieCategory[];
  readonly consentVersion: number;
  readonly consentCookieName?: string;
  readonly consentMaxAgeDays?: number;
}

export class LegalConfigError extends Error {
  name = "LegalConfigError";
}

export const LEGAL_CONFIG_FILE = "src/features/legal/legal.config.ts";

const FAIL_CLOSED_CONFIG: LegalConfig = {
  cookieCategories: [],
  consentVersion: 1,
  consentCookieName: DEFAULT_CONSENT_COOKIE_NAME,
  consentMaxAgeDays: DEFAULT_CONSENT_MAX_AGE_DAYS,
};

function describeProblems(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length === 0 ? "(root)" : issue.path.join(".");
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}

export function defineLegalConfig(input: LegalConfig): LegalConfig {
  const parsed = legalConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new LegalConfigError(
      `Invalid legal config: ${describeProblems(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function resolveLegalConfig(input: unknown): {
  config: LegalConfig;
  error: LegalConfigError | null;
} {
  const parsed = legalConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      config: { ...FAIL_CLOSED_CONFIG },
      error: new LegalConfigError(
        `Invalid ${LEGAL_CONFIG_FILE}: ${describeProblems(parsed.error)}`,
      ),
    };
  }
  return { config: parsed.data, error: null };
}
