import { APIError } from "better-auth/api";
import { defaultLocale, type AppLocale } from "@/i18n/config";
import { getCoreTranslator } from "@/i18n/core-translator";

interface SignupPolicyInput {
  publicSignup: boolean;
  hasInvitation: boolean;
  locale?: AppLocale;
}

export function assertSignupAllowed({
  publicSignup,
  hasInvitation,
  locale = defaultLocale,
}: SignupPolicyInput): void {
  if (!publicSignup && !hasInvitation) {
    throw new APIError("FORBIDDEN", {
      message: getCoreTranslator(locale, "errors")("signupDisabled"),
    });
  }
}
