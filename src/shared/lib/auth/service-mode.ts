import { defaultLocale } from "@/i18n/config";
import { getCoreTranslator } from "@/i18n/core-translator";
import { DomainError } from "@/shared/utils/error-handling";
import type { OrgContext } from "./org-context";

export type ServiceModeConfirmation = {
  serviceModeConfirmed: true;
  organizationId: string;
};

const SERVICE_MODE_KEY = "serviceModeConfirmationRequired";

export class ServiceModeConfirmationError extends DomainError {
  constructor() {
    super(getCoreTranslator(defaultLocale, "errors")(SERVICE_MODE_KEY), {
      key: SERVICE_MODE_KEY,
    });
    this.name = "ServiceModeConfirmationError";
  }
}

function confirmsOrganization(
  confirmation: unknown,
  organizationId: string,
): boolean {
  if (typeof confirmation !== "object" || confirmation === null) {
    return false;
  }
  const candidate = confirmation as Record<string, unknown>;
  return (
    candidate.serviceModeConfirmed === true &&
    candidate.organizationId === organizationId
  );
}

export function assertServiceModeConfirmed(
  context: OrgContext,
  confirmation: unknown,
): void {
  if (confirmation === undefined && !context.serviceMode) {
    return;
  }
  if (!confirmsOrganization(confirmation, context.organizationId)) {
    throw new ServiceModeConfirmationError();
  }
}
