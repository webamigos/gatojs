import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "@/env";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { requireUser } from "@/shared/lib/auth/helpers";
import { Slot } from "@/shared/components/slot";
import { DashboardPlaceholder } from "@/features/dashboard/components/dashboard-placeholder";

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const context = await requireModuleAccess("dashboard");
  const user = await requireUser();
  const t = await getTranslations("dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Slot
        id="dashboard.sections"
        context={{ organizationId: context.organizationId }}
        viewer={{
          userRole: context.userRole,
          orgRole: context.orgRole,
          multiOrg: env.MULTI_ORG,
        }}
        fallback={<DashboardPlaceholder userName={user.name || user.email} />}
      />
    </div>
  );
}
