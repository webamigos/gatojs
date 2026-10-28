import { locales } from "./locales.generated";

export { locales };
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pl";
