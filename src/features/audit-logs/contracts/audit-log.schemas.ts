import { z } from "zod";
import {
  AUDIT_LOG_PAGE_SIZES,
  AUDIT_LOG_SORT_COLUMNS,
  type AuditLogFilters,
} from "./audit-log.types";

const DEFAULT_PAGE_SIZE = 25;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MAX_PAGE = 1_000_000;

const pageSchema = z.coerce.number().int().min(1).max(MAX_PAGE);
const pageSizeSchema = z.coerce
  .number()
  .pipe(z.union(AUDIT_LOG_PAGE_SIZES.map((size) => z.literal(size))));
const sortBySchema = z.enum(AUDIT_LOG_SORT_COLUMNS);
const sortDirSchema = z.enum(["asc", "desc"]);
const textSchema = z.string().trim().min(1).max(200);

interface TimeOfDay {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

const START_OF_DAY: TimeOfDay = {
  hours: 0,
  minutes: 0,
  seconds: 0,
  milliseconds: 0,
};
const END_OF_DAY: TimeOfDay = {
  hours: 23,
  minutes: 59,
  seconds: 59,
  milliseconds: 999,
};

function dateAt(value: unknown, time: TimeOfDay): Date | undefined {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    time.hours,
    time.minutes,
    time.seconds,
    time.milliseconds,
  );
  const exists =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return exists ? date : undefined;
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
      from: dateAt(raw.from, START_OF_DAY),
      to: dateAt(raw.to, END_OF_DAY),
    } as AuditLogFilters);
  });
