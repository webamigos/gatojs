export const WELCOME_SET_PASSWORD_PATH = "/set-password";

export function isWelcomeSetPasswordUrl(url: string): boolean {
  try {
    return (
      new URL(url).searchParams.get("callbackURL") === WELCOME_SET_PASSWORD_PATH
    );
  } catch {
    return false;
  }
}
