export const COOKIE_CATEGORIES = [
  "preferences",
  "analytics",
  "marketing",
] as const;

export type CookieCategory = (typeof COOKIE_CATEGORIES)[number];

export interface LegalConfig {
  readonly cookieCategories: readonly CookieCategory[];
  readonly consentVersion: number;
}

export class LegalConfigError extends Error {
  name = "LegalConfigError";
}

export function isCookieCategory(value: unknown): value is CookieCategory {
  return (COOKIE_CATEGORIES as readonly unknown[]).includes(value);
}

function configProblems(input: LegalConfig): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const category of input.cookieCategories) {
    if (!isCookieCategory(category)) {
      problems.push(`unknown cookie category: ${String(category)}`);
    } else if (seen.has(category)) {
      problems.push(`duplicate cookie category: ${category}`);
    }
    seen.add(category);
  }
  if (!Number.isInteger(input.consentVersion) || input.consentVersion < 1) {
    problems.push("consentVersion must be a positive integer");
  }
  return problems;
}

export function defineLegalConfig(input: LegalConfig): LegalConfig {
  const problems = configProblems(input);
  if (problems.length > 0) {
    throw new LegalConfigError(`Invalid legal config: ${problems.join("; ")}`);
  }
  return {
    cookieCategories: [...input.cookieCategories],
    consentVersion: input.consentVersion,
  };
}
