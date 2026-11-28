import { auditSinks } from "@/modules.generated";
import type { OrgContext } from "@/shared/lib/auth/org-context";
import { currentRequestPrincipal } from "@/shared/lib/auth/request-principal";
import { logger } from "@/shared/lib/logger";

export type AuditChannel = "WEB" | "API" | "MCP";

export interface AuditEvent {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  channel?: AuditChannel;
  credentialId?: string | null;
  serviceMode?: boolean;
  correlationId?: string;
}

export type AuditSink = (event: AuditEvent) => Promise<void>;

export function auditActor(
  context: OrgContext,
): Pick<
  AuditEvent,
  | "organizationId"
  | "actorUserId"
  | "serviceMode"
  | "channel"
  | "credentialId"
  | "correlationId"
> {
  const actor = {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    serviceMode: context.serviceMode,
  };
  const principal = currentRequestPrincipal();
  if (!principal) {
    return actor;
  }
  return {
    ...actor,
    channel: "MCP",
    credentialId: principal.credentialId,
    correlationId: principal.correlationId,
  };
}

export async function trackAudit(
  event: AuditEvent,
  sinks: readonly AuditSink[] = auditSinks,
): Promise<void> {
  for (const sink of sinks) {
    try {
      await sink(event);
    } catch (error) {
      logger.error("trackAudit failed", { action: event.action, error });
    }
  }
}
