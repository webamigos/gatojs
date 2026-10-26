import { redirect } from "@/i18n/routing";
import {
  getOrgContext,
  NoOrganizationError,
} from "@/shared/lib/auth/org-context";

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { locale } = await params;
  try {
    await getOrgContext();
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      redirect({ href: "/no-organization", locale });
    }
    throw error;
  }
  return children;
}
