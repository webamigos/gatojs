import "server-only";
import { cookies } from "next/headers";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";

export async function forwardAuthCookies(
  responseHeaders: Headers,
): Promise<void> {
  const setCookie = responseHeaders.get("set-cookie");
  if (!setCookie) {
    return;
  }
  const cookieStore = await cookies();
  for (const [name, attributes] of parseSetCookieHeader(setCookie)) {
    cookieStore.set(name, attributes.value, toCookieOptions(attributes));
  }
}
