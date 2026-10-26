import { prisma } from "@/shared/lib/prisma";
import { assertSignupAllowed } from "./signup-policy";

export function readBodyString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

async function hasPendingInvitation(body: unknown): Promise<boolean> {
  const invitationId = readBodyString(body, "invitationId");
  const email = readBodyString(body, "email");
  if (!invitationId || !email) {
    return false;
  }
  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      email: { equals: email, mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invitation !== null;
}

export async function enforceSignupPolicy(
  body: unknown,
  publicSignup: boolean,
): Promise<void> {
  assertSignupAllowed({
    publicSignup,
    hasInvitation: publicSignup ? false : await hasPendingInvitation(body),
  });
}
