import "server-only";

import { env } from "@/env";
import { getOrgContext } from "@/shared/lib/auth/org-context";
import { canAccessModule, moduleByKey } from "@/shared/lib/auth/permissions";
import { prisma } from "@/shared/lib/prisma";
import type { AuditLogRow } from "../../contracts/audit-log.types";
import { AUDIT_LOG_ACTOR_SELECT, toAuditLogRow } from "../audit-log-mapper";

const MODULE_KEY = "audit-logs";
const TRAIL_LIMIT = 50;

export async function getEntityAuditTrailQuery(
  entityType: string,
  entityId: string,
): Promise<AuditLogRow[] | null> {
  const context = await getOrgContext();
  const moduleDef = moduleByKey(MODULE_KEY);
  const allowed =
    moduleDef !== null &&
    canAccessModule(moduleDef, {
      userRole: context.userRole,
      orgRole: context.orgRole,
      multiOrg: env.MULTI_ORG,
    });
  if (!allowed) {
    return null;
  }

  const rows = await prisma.auditLog.findMany({
    where: { organizationId: context.organizationId, entityType, entityId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: TRAIL_LIMIT,
    include: { user: { select: AUDIT_LOG_ACTOR_SELECT } },
  });

  return rows.map(toAuditLogRow);
}
