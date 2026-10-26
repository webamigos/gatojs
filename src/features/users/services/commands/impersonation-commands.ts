"use server";

import {
  getCurrentUser,
  getImpersonatedByUserId,
} from "@/shared/lib/auth/helpers";
import { logger } from "@/shared/lib/logger";
import { handleCommandError } from "@/shared/utils/error-handling";
import type { OperationResult } from "@/shared/types/common";

type ImpersonationEvent = "started" | "stopped";

async function logImpersonationEvent(
  event: ImpersonationEvent,
): Promise<OperationResult> {
  try {
    const impersonatorUserId = await getImpersonatedByUserId();
    if (!impersonatorUserId) {
      return { success: true };
    }
    const target = await getCurrentUser();
    logger.info(`[USERS] Impersonation ${event}`, {
      impersonatorUserId,
      targetUserId: target?.id ?? null,
    });
    return { success: true };
  } catch (error) {
    return handleCommandError(
      error,
      "Nie udało się zapisać zdarzenia impersonacji",
    );
  }
}

export async function logImpersonationStartCommand(): Promise<OperationResult> {
  return logImpersonationEvent("started");
}

export async function logImpersonationStopCommand(): Promise<OperationResult> {
  return logImpersonationEvent("stopped");
}
