"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";
import { withInviteSignup } from "@/shared/lib/auth/invite-signup-scope";
import { createWelcomeSetPasswordUrl } from "@/shared/lib/auth/welcome-set-password";
import { sendWelcomeSetPasswordEmail } from "@/shared/lib/mailer";
import { defineCommand } from "@/shared/lib/commands/define-command";
import { runCommand } from "@/shared/lib/commands/run-command";
import { inviteUserSchema } from "../../contracts/user-account.schemas";
import type { OperationResult } from "@/shared/types/common";

type RequestHeaders = Awaited<ReturnType<typeof headers>>;

type InviteUserResult = OperationResult<{ userId: string }> & {
  warning?: "mail-failed";
};

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

const inviteUser = defineCommand({
  key: "users.invite",
  module: "users",
  access: "global-admin",
  input: inviteUserSchema,
  failureMessage: "Nie udało się zaprosić użytkownika",
  deniedMessage: "Brak uprawnień",
  invalidInputMessage: (error) =>
    error.issues[0]?.message ?? "Nieprawidłowe dane",
  events: ["users.invited", "organizations.member-added"],
  run: async (
    { name, email, role },
    context,
    emit,
  ): Promise<InviteUserResult> => {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return {
        success: false,
        error: "Użytkownik z tym adresem już istnieje",
      };
    }

    const invitation = await prisma.invitation.create({
      data: {
        organizationId: context.organizationId,
        email,
        role,
        inviterId: context.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: { id: true },
    });

    const requestHeaders = await headers();
    const userId = await registerInvitedUser(
      { name, email, invitationId: invitation.id },
      requestHeaders,
    );
    const member = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: context.organizationId,
          userId,
        },
      },
      select: { id: true },
    });
    emit("users.invited", { invitationId: invitation.id, email, role });
    if (member) {
      emit("organizations.member-added", {
        memberId: member.id,
        userId,
        role,
      });
    }

    const mailSent = await sendWelcomeEmailBestEffort({ name, email, userId });

    revalidatePath("/users");
    return mailSent
      ? { success: true, data: { userId } }
      : { success: true, data: { userId }, warning: "mail-failed" };
  },
});

export async function inviteUserCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<InviteUserResult> {
  return runCommand(inviteUser, input, confirmation);
}

async function registerInvitedUser(
  data: { name: string; email: string; invitationId: string },
  requestHeaders: RequestHeaders,
): Promise<string> {
  const { auth } = await import("@/shared/lib/auth");
  const body = {
    name: data.name,
    email: data.email,
    password: randomBytes(24).toString("base64url"),
    invitationId: data.invitationId,
  };

  try {
    const { user } = await withInviteSignup(() =>
      auth.api.signUpEmail({ body, headers: requestHeaders }),
    );
    return user.id;
  } catch (error) {
    await discardInvitation(data.invitationId);
    throw error;
  }
}

async function discardInvitation(invitationId: string): Promise<void> {
  try {
    await prisma.invitation.delete({ where: { id: invitationId } });
  } catch (error) {
    logger.error("[USERS] Failed to discard invitation", {
      invitationId,
      err: error,
    });
  }
}

async function sendWelcomeEmailBestEffort(recipient: {
  name: string;
  email: string;
  userId: string;
}): Promise<boolean> {
  try {
    const resetUrl = await createWelcomeSetPasswordUrl(recipient.userId);
    const delivery = await sendWelcomeSetPasswordEmail({
      to: recipient.email,
      name: recipient.name,
      resetUrl,
    });
    if ("error" in delivery) {
      logger.error("[USERS] Welcome set-password email not delivered", {
        userId: recipient.userId,
        err: delivery.error,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("[USERS] Failed to send set-password email", {
      userId: recipient.userId,
      err: error,
    });
    return false;
  }
}
