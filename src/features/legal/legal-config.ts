import {
  COOKIE_CATEGORIES,
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

export function defineLegalConfig(input: LegalConfig): LegalConfig {
  const parsed = legalConfigSchema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => issue.message);
    throw new LegalConfigError(`Invalid legal config: ${problems.join("; ")}`);
  }
  return parsed.data;
}
