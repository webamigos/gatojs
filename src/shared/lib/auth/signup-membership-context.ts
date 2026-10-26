import type { SignupMembership } from "@/features/organizations/services/signup-membership";

export function readSignupMembership(
  context: unknown,
): SignupMembership | null {
  if (typeof context !== "object" || context === null) {
    return null;
  }
  const value = (context as { signupMembership?: unknown }).signupMembership;
  if (typeof value !== "object" || value === null || !("action" in value)) {
    return null;
  }
  const { action } = value as { action: unknown };
  return action === "join" || action === "create"
    ? (value as SignupMembership)
    : null;
}
