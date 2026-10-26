import { setRequestLocale } from "next-intl/server";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { requireUser } from "@/shared/lib/auth/helpers";
import { DashboardPlaceholder } from "@/features/dashboard/components/dashboard-placeholder";

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModuleAccess("dashboard");
  const user = await requireUser();
  return <DashboardPlaceholder userName={user.name || user.email} />;
}
