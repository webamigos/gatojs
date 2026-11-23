import { locales } from "./locales.generated";

export { locales };
export type Locale = (typeof locales)[number];
export type AppLocale = Locale;
export const defaultLocale: Locale = "pl";

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && (locales as readonly string[]).includes(value)
  );
}
