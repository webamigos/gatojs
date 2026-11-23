import { getLocale } from "next-intl/server";
import { defaultLocale, isAppLocale, type AppLocale } from "./config";

const LOCALE_COOKIE = "NEXT_LOCALE";

export async function currentLocale(): Promise<AppLocale> {
  try {
    const locale = await getLocale();
    return isAppLocale(locale) ? locale : defaultLocale;
  } catch {
    // WHY: getLocale throws outside a next-intl request scope (route handlers, scripts);
    // those fall back to the default locale.
    return defaultLocale;
  }
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function refererLocale(referer: string): string | undefined {
  try {
    return new URL(referer).pathname.split("/")[1];
  } catch {
    return undefined;
  }
}

export function localeFromHeaders(
  headers: Headers | null | undefined,
): AppLocale {
  const cookie = headers?.get("cookie");
  const fromCookie = cookie ? cookieValue(cookie, LOCALE_COOKIE) : undefined;
  if (isAppLocale(fromCookie)) {
    return fromCookie;
  }
  const referer = headers?.get("referer");
  const fromReferer = referer ? refererLocale(referer) : undefined;
  if (isAppLocale(fromReferer)) {
    return fromReferer;
  }
  return defaultLocale;
}
