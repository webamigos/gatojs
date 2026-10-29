import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/lib/prisma";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import type { PaginatedResult } from "@/shared/types/common";
import { auditLogFiltersSchema } from "../../contracts/audit-log.schemas";
import type {
  AuditLogActorOption,
  AuditLogFilters,
  AuditLogRow,
} from "../../contracts/audit-log.types";

const MODULE_KEY = "audit-logs";

function buildWhere(
  organizationId: string,
  filters: AuditLogFilters,
): Prisma.AuditLogWhereInput {
  return {
    organizationId,
    userId: filters.userId,
    action: filters.action,
    entityType: filters.entityType,
    entityId: filters.entityId,
    createdAt: { gte: filters.from, lte: filters.to },
  };
}

export async function listAuditLogsQuery(
  input: unknown,
): Promise<PaginatedResult<AuditLogRow>> {
  const { organizationId } = await requireModuleAccess(MODULE_KEY);
  const filters = auditLogFiltersSchema.parse(input);
  const where = buildWhere(organizationId, filters);

  const [rows, totalItems] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ [filters.sortBy]: filters.sortDir }, { id: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map(({ user, ...row }) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: user,
      oldData: row.oldData,
      newData: row.newData,
      channel: row.channel,
      serviceMode: row.serviceMode,
    })),
    totalItems,
    totalPages: Math.ceil(totalItems / filters.pageSize),
    currentPage: filters.page,
    pageSize: filters.pageSize,
  };
}

export async function listAuditLogActorsQuery(): Promise<
  AuditLogActorOption[]
> {
  const { organizationId } = await requireModuleAccess(MODULE_KEY);

  const users = await prisma.user.findMany({
    where: { auditLogs: { some: { organizationId } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return users;
}
