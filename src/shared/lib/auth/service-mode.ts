import { DomainError } from "@/shared/utils/error-handling";
import type { OrgContext } from "./org-context";

export type ServiceModeConfirmation = {
  serviceModeConfirmed: true;
  organizationId: string;
};

export class ServiceModeConfirmationError extends DomainError {
  constructor() {
    super("Potwierdź zmianę w trybie serwisowym");
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
