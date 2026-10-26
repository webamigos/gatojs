import { logger } from "@/shared/lib/logger";
import { OperationResult } from "@/shared/types/common";

export class DomainError extends Error {}

export function rethrowAsUserFacing(error: unknown): never {
  if (error instanceof DomainError) {
    throw error;
  }
  const msg = error instanceof Error ? error.message : String(error);
  throw new DomainError(msg);
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
  logger.error(defaultMessage, { err: error });
  return {
    success: false,
    error: defaultMessage,
  };
}
