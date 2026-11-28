import type { AuditLogRow } from "../contracts/audit-log.types";

export const AUDIT_LOG_ACTOR_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

interface AuditLogRecord {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  channel: "WEB" | "API" | "MCP";
  serviceMode: boolean;
  user: AuditLogRow["actor"];
}

export function toAuditLogRow(record: AuditLogRecord): AuditLogRow {
  return {
    id: record.id,
    createdAt: record.createdAt,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    actor: record.user,
    oldData: record.oldData,
    newData: record.newData,
    channel: record.channel,
    serviceMode: record.serviceMode,
  };
}
