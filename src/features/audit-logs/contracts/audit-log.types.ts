export const AUDIT_LOG_PAGE_SIZES = [10, 25, 50, 100] as const;
export const AUDIT_LOG_SORT_COLUMNS = [
  "createdAt",
  "action",
  "entityType",
] as const;

export type AuditLogPageSize = (typeof AUDIT_LOG_PAGE_SIZES)[number];
export type AuditLogSortColumn = (typeof AUDIT_LOG_SORT_COLUMNS)[number];

export interface AuditLogFilters {
  page: number;
  pageSize: AuditLogPageSize;
  sortBy: AuditLogSortColumn;
  sortDir: "asc" | "desc";
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogRow {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: AuditLogActor | null;
  oldData: unknown;
  newData: unknown;
  channel: "WEB" | "API";
  serviceMode: boolean;
}

export interface AuditLogActorOption {
  id: string;
  name: string;
}
