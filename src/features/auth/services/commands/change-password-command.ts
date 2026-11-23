"use server";

import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import {
  handleCommandError,
  translatedFailure,
} from "@/shared/utils/error-handling";

export async function changePasswordCommand(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return translatedFailure({ key: "sessionExpired" });
    }

    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      },
      headers: await headers(),
    });

    return { success: true };
  } catch (error) {
    return handleCommandError(error, { key: "changePasswordFailed" });
  }
}
