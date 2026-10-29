import { z } from "zod";
import {
  AUDIT_LOG_PAGE_SIZES,
  AUDIT_LOG_SORT_COLUMNS,
  type AuditLogFilters,
} from "./audit-log.types";

const DEFAULT_PAGE_SIZE = 25;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pageSchema = z.coerce.number().int().min(1);
const pageSizeSchema = z.coerce
  .number()
  .pipe(z.union(AUDIT_LOG_PAGE_SIZES.map((size) => z.literal(size))));
const sortBySchema = z.enum(AUDIT_LOG_SORT_COLUMNS);
const sortDirSchema = z.enum(["asc", "desc"]);
const textSchema = z.string().trim().min(1).max(200);

function dateAt(value: unknown, time: string): Date | undefined {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T${time}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function valueOrUndefined<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function toRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)
    : {};
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export const auditLogFiltersSchema: z.ZodType<AuditLogFilters, unknown> = z
  .unknown()
  .transform((input): AuditLogFilters => {
    const raw = toRecord(input);
    return withoutUndefined({
      page: valueOrUndefined(pageSchema, raw.page) ?? 1,
      pageSize:
        valueOrUndefined(pageSizeSchema, raw.pageSize) ?? DEFAULT_PAGE_SIZE,
      sortBy: valueOrUndefined(sortBySchema, raw.sortBy) ?? "createdAt",
      sortDir: valueOrUndefined(sortDirSchema, raw.sortDir) ?? "desc",
      userId: valueOrUndefined(textSchema, raw.userId),
      action: valueOrUndefined(textSchema, raw.action),
      entityType: valueOrUndefined(textSchema, raw.entityType),
      entityId: valueOrUndefined(textSchema, raw.entityId),
      from: dateAt(raw.from, "00:00:00.000"),
      to: dateAt(raw.to, "23:59:59.999"),
    } as AuditLogFilters);
  });
