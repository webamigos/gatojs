import { APIError } from "better-auth/api";

interface SignupPolicyInput {
  publicSignup: boolean;
  hasInvitation: boolean;
}

export function assertSignupAllowed({
  publicSignup,
  hasInvitation,
}: SignupPolicyInput): void {
  if (!publicSignup && !hasInvitation) {
    throw new APIError("FORBIDDEN", { message: "Rejestracja jest wyłączona" });
  }
}
