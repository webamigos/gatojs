import { z } from "zod";

export const COOKIE_CATEGORIES = [
  "preferences",
  "analytics",
  "marketing",
] as const;

export type CookieCategory = (typeof COOKIE_CATEGORIES)[number];

export const DEFAULT_CONSENT_COOKIE_NAME = "cookie_consent";

export const DEFAULT_CONSENT_MAX_AGE_DAYS = 180;

export function isCookieCategory(value: unknown): value is CookieCategory {
  return (COOKIE_CATEGORIES as readonly unknown[]).includes(value);
}

const cookieCategoriesSchema = z
  .array(z.unknown())
  .superRefine((categories, context) => {
    const seen = new Set<unknown>();
    categories.forEach((category, index) => {
      if (!isCookieCategory(category)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `unknown cookie category: ${String(category)}`,
        });
      } else if (seen.has(category)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `duplicate cookie category: ${category}`,
        });
      }
      seen.add(category);
    });
  })
  .transform((categories) => categories as CookieCategory[]);

const consentVersionSchema = z
  .number({ error: "consentVersion must be a positive integer" })
  .int({ error: "consentVersion must be a positive integer" })
  .min(1, { error: "consentVersion must be a positive integer" });

const CONSENT_COOKIE_NAME_MESSAGE =
  "consentCookieName must be 1-64 letters, digits, _ or -";

const RESERVED_CONSENT_COOKIE_NAME_MESSAGE =
  "consentCookieName must not be NEXT_LOCALE, a better-auth cookie or use the __Host- or __Secure- prefix";

const RESERVED_COOKIE_NAME_PATTERN =
  /^(next_locale$|better-auth|__host-|__secure-)/i;

const consentCookieNameSchema = z
  .string({ error: CONSENT_COOKIE_NAME_MESSAGE })
  .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: CONSENT_COOKIE_NAME_MESSAGE })
  .refine((name) => !RESERVED_COOKIE_NAME_PATTERN.test(name), {
    error: RESERVED_CONSENT_COOKIE_NAME_MESSAGE,
  });

const CONSENT_MAX_AGE_DAYS_MESSAGE =
  "consentMaxAgeDays must be an integer from 1 to 395";

const consentMaxAgeDaysSchema = z
  .number({ error: CONSENT_MAX_AGE_DAYS_MESSAGE })
  .int({ error: CONSENT_MAX_AGE_DAYS_MESSAGE })
  .min(1, { error: CONSENT_MAX_AGE_DAYS_MESSAGE })
  .max(395, { error: CONSENT_MAX_AGE_DAYS_MESSAGE });

export const legalConfigSchema = z.object({
  cookieCategories: cookieCategoriesSchema,
  consentVersion: consentVersionSchema,
  consentCookieName: consentCookieNameSchema.default(
    DEFAULT_CONSENT_COOKIE_NAME,
  ),
  consentMaxAgeDays: consentMaxAgeDaysSchema.default(
    DEFAULT_CONSENT_MAX_AGE_DAYS,
  ),
});

export type LegalConfigInput = z.input<typeof legalConfigSchema>;
