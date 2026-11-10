"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import { auditActor, trackAudit } from "@/shared/lib/audit";
import { getAdminUserOrNull } from "@/shared/lib/auth/helpers";
import { getOrgContext } from "@/shared/lib/auth/org-context";
import { assertServiceModeConfirmed } from "@/shared/lib/auth/service-mode";
import { logger } from "@/shared/lib/logger";
import { handleCommandError } from "@/shared/utils/error-handling";
import { createWelcomeSetPasswordUrl } from "@/shared/lib/auth/welcome-set-password";
import { sendWelcomeSetPasswordEmail } from "@/shared/lib/mailer";
import { inviteUserSchema } from "../../contracts/user-account.schemas";
import type { OperationResult } from "@/shared/types/common";

type RequestHeaders = Awaited<ReturnType<typeof headers>>;

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

export async function inviteUserCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult<{ userId: string }> & { warning?: "mail-failed" }> {
  try {
    const admin = await getAdminUserOrNull();
    if (!admin) {
      return { success: false, error: "Brak uprawnień" };
    }

    const parsed = inviteUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane",
      };
    }
    const { name, email, role } = parsed.data;

    const context = await getOrgContext();
    assertServiceModeConfirmed(context, confirmation);

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
        inviterId: admin.id,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: { id: true },
    });

    const requestHeaders = await headers();
    const userId = await registerInvitedUser(
      { name, email, invitationId: invitation.id },
      requestHeaders,
    );
    await trackAudit({
      ...auditActor(context),
      action: "member.invited",
      entityType: "invitation",
      entityId: invitation.id,
      newData: { email, role },
    });

    await markEmailVerified(userId);
    const mailSent = await sendWelcomeEmailBestEffort({ name, email, userId });

    revalidatePath("/users");
    return mailSent
      ? { success: true, data: { userId } }
      : { success: true, data: { userId }, warning: "mail-failed" };
  } catch (error) {
    return handleCommandError(error, "Nie udało się zaprosić użytkownika");
  }
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
    const { user } = await auth.api.signUpEmail({
      body,
      headers: requestHeaders,
    });
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

async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  });
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
