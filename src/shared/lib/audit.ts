import { auditSinks } from "@/modules.generated";
import type { OrgContext } from "@/shared/lib/auth/org-context";
import { logger } from "@/shared/lib/logger";

export type AuditChannel = "WEB" | "API";

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
}

export type AuditSink = (event: AuditEvent) => Promise<void>;

export function auditActor(
  context: OrgContext,
): Pick<AuditEvent, "organizationId" | "actorUserId" | "serviceMode"> {
  return {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    serviceMode: context.serviceMode,
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
