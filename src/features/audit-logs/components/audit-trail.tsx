import { format } from "date-fns";
import { getTranslations } from "next-intl/server";
import { modules } from "@/modules.generated";
import { findAuditActionLabel } from "../services/audit-action-labels";
import { getEntityAuditTrailQuery } from "../services/queries/audit-trail-query";

interface AuditTrailProps {
  entityType: string;
  entityId: string;
}

export async function AuditTrail({ entityType, entityId }: AuditTrailProps) {
  const rows = await getEntityAuditTrailQuery(entityType, entityId);
  if (rows === null) {
    return null;
  }
  const t = await getTranslations("audit-logs");
  const root = await getTranslations();

  function actionLabel(action: string): string {
    const found = findAuditActionLabel(action, modules);
    return found ? root(`${found.namespace}.${found.labelKey}`) : action;
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("no-history")}</p>;
  }

  return (
    <ul className="divide-y text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap gap-x-3 py-2">
          <time dateTime={row.createdAt.toISOString()}>
            {format(row.createdAt, "yyyy-MM-dd HH:mm")}
          </time>
          <span>{actionLabel(row.action)}</span>
          <span className="text-muted-foreground">
            {row.actor?.name ?? t("source-system")}
          </span>
        </li>
      ))}
    </ul>
  );
}
