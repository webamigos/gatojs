import { currentLocale } from "@/i18n/server-locale";
import { getTranslator } from "@/i18n/server-translator";
import type { TranslationValues } from "@/i18n/translator";
import { logger } from "@/shared/lib/logger";
import { OperationResult } from "@/shared/types/common";

export type MessageDescriptor = {
  key: string;
  namespace?: string;
  values?: TranslationValues;
};

const DEFAULT_NAMESPACE = "errors";

export class DomainError extends Error {
  name = "DomainError";
  readonly translation: MessageDescriptor | undefined;

  constructor(message: string, translation?: MessageDescriptor) {
    super(message);
    this.translation = translation;
  }
}

export async function translateMessage(
  descriptor: MessageDescriptor,
): Promise<string> {
  const translate = await getTranslator(
    await currentLocale(),
    descriptor.namespace ?? DEFAULT_NAMESPACE,
  );
  return translate(descriptor.key, descriptor.values);
}

export async function translatedFailure(
  descriptor: MessageDescriptor,
): Promise<OperationResult<never>> {
  return { success: false, error: await translateMessage(descriptor) };
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

async function resolveMessage(
  message: string | MessageDescriptor,
): Promise<string> {
  return typeof message === "string" ? message : translateMessage(message);
}

export async function handleCommandError(
  error: unknown,
  defaultMessage: string | MessageDescriptor,
): Promise<OperationResult<never>> {
  if (isNextRedirect(error)) {
    throw error;
  }
  const fallback = await resolveMessage(defaultMessage);
  if (error instanceof DomainError) {
    logger.warn(fallback, { err: error });
    const message = error.translation
      ? await translateMessage(error.translation)
      : error.message;
    return { success: false, error: message };
  }
  logger.error(fallback, { err: error });
  return { success: false, error: fallback };
}
