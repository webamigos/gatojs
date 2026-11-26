import { logger } from "@/shared/lib/logger";
import { ModuleDisabledError } from "@/shared/lib/modules/module-disabled-error";
import type { OperationResult } from "@/shared/types/common";

export class DomainError extends Error {
  name = "DomainError";
}

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function handleCommandError(
  error: unknown,
  defaultMessage: string,
): OperationResult<never> {
  if (isNextRedirect(error)) {
    throw error;
  }
  if (error instanceof DomainError) {
    logger.warn(defaultMessage, { err: error });
    return { success: false, error: error.message };
  }
  if (error instanceof ModuleDisabledError) {
    logger.warn(defaultMessage, { err: error });
    return { success: false, error: defaultMessage };
  }
  logger.error(defaultMessage, { err: error });
  return {
    success: false,
    error: defaultMessage,
  };
}
