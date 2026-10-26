import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/shared/lib/auth/helpers";
import { DashboardPlaceholder } from "@/features/dashboard/components/dashboard-placeholder";

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  return <DashboardPlaceholder userName={user.name || user.email} />;
}
