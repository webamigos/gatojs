import { generateId } from "better-auth";
import { auth } from "@/shared/lib/auth";
import { WELCOME_SET_PASSWORD_PATH } from "./reset-password-routing";

const DEFAULT_RESET_TOKEN_TTL_SECONDS = 60 * 60;

export async function createWelcomeSetPasswordUrl(
  userId: string,
): Promise<string> {
  const context = await auth.$context;
  const token = generateId(24);
  const ttlSeconds =
    context.options.emailAndPassword?.resetPasswordTokenExpiresIn ??
    DEFAULT_RESET_TOKEN_TTL_SECONDS;
  await context.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });
  const callbackURL = encodeURIComponent(WELCOME_SET_PASSWORD_PATH);
  return `${context.baseURL}/reset-password/${token}?callbackURL=${callbackURL}`;
}
