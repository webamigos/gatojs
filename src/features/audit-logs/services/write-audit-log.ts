import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/lib/prisma";
import type { AuditEvent } from "@/shared/lib/audit";
import { redactSensitive } from "./redact";

function toJson(value: unknown) {
  return redactSensitive(value) as Prisma.InputJsonValue | undefined;
}

export async function writeAuditLog(event: AuditEvent): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: event.organizationId,
      userId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      oldData: toJson(event.oldData),
      newData: toJson(event.newData),
      channel: event.channel ?? "WEB",
      credentialId: event.credentialId ?? null,
      serviceMode: event.serviceMode ?? false,
    },
  });
}
