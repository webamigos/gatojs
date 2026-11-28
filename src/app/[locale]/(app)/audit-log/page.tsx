import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { PageHeader } from "@/shared/components/page-header";
import { AuditLogView } from "@/features/audit-logs/components/audit-log-view";
import { auditLogFiltersSchema } from "@/features/audit-logs/contracts/audit-log.schemas";
import {
  listAuditLogActorsQuery,
  listAuditLogsQuery,
} from "@/features/audit-logs/services/queries/audit-log-queries";

interface AuditLogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditLogPage({
  params,
  searchParams,
}: AuditLogPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModuleAccess("audit-logs");

  const rawFilters = await searchParams;
  const filters = auditLogFiltersSchema.parse(rawFilters);
  const [t, result, actors] = await Promise.all([
    getTranslations("audit-logs"),
    listAuditLogsQuery(rawFilters),
    listAuditLogActorsQuery(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} description={t("description")} />
      <AuditLogView result={result} filters={filters} actors={actors} />
    </div>
  );
}
