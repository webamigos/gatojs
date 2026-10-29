import type { AuditSink } from "@/shared/lib/audit";
import { writeAuditLog } from "./services/write-audit-log";

export const auditSink: AuditSink = writeAuditLog;
