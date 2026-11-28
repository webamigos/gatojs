import { redirect } from "@/i18n/routing";
import { env } from "@/env";
import { getCurrentUserWithImpersonation } from "@/shared/lib/auth/helpers";
import {
  getOrgContext,
  NoOrganizationError,
  type OrgContext,
} from "@/shared/lib/auth/org-context";
import {
  AppSidebar,
  MobileHeader,
  SidebarProvider,
} from "@/shared/components/app-sidebar";
import { ServiceModeProvider } from "@/shared/components/service-mode/service-mode-provider";
import { ServiceModeBanner } from "@/shared/components/service-mode/service-mode-banner";
import { Slot } from "@/shared/components/slot";
import { ImpersonationBanner } from "@/features/users/components/impersonation-banner";
import { logImpersonationStopCommand } from "@/features/users/services/commands/impersonation-commands";
import { OrgSwitcher } from "@/features/organizations/components/org-switcher";
import { getSwitchableOrganizationsQuery } from "@/features/organizations/services/queries/switchable-organizations-query";

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

async function resolveOrgContext(locale: string): Promise<OrgContext> {
  try {
    return await getOrgContext();
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      return redirect({ href: "/no-organization", locale });
    }
    throw error;
  }
}

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { locale } = await params;
  const orgContext = await resolveOrgContext(locale);
  const { user, impersonatedBy } = await getCurrentUserWithImpersonation();
  if (!user) {
    return redirect({ href: "/sign-in", locale });
  }
  const multiOrg = env.MULTI_ORG;
  const accessContext = {
    userRole: orgContext.userRole,
    orgRole: orgContext.orgRole,
    multiOrg,
  };
  const switchableOrganizations = await getSwitchableOrganizationsQuery();
  const activeOrganizationName =
    switchableOrganizations.find(
      (organization) => organization.id === orgContext.organizationId,
    )?.name ?? "";

  return (
    <ServiceModeProvider
      active={orgContext.serviceMode}
      organizationId={orgContext.organizationId}
      organizationName={activeOrganizationName}
    >
      <SidebarProvider>
        <ServiceModeBanner />
        <ImpersonationBanner
          active={impersonatedBy !== null}
          userName={user.name || user.email}
          onStopLogged={logImpersonationStopCommand}
        />
        <div className="flex min-h-screen">
          <AppSidebar
            accessContext={accessContext}
            userName={user.name}
            userEmail={user.email}
            footer={
              <Slot
                id="app.sidebar.footer"
                context={{ organizationId: orgContext.organizationId }}
                viewer={accessContext}
              />
            }
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader />
            <main className="flex-1 space-y-4 p-4 md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <OrgSwitcher
                  organizations={switchableOrganizations}
                  activeOrganizationId={orgContext.organizationId}
                  canCreateOrganization={multiOrg}
                />
                <div className="ml-auto flex items-center gap-2">
                  <Slot
                    id="app.header.actions"
                    context={{ organizationId: orgContext.organizationId }}
                    viewer={accessContext}
                  />
                </div>
              </div>
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ServiceModeProvider>
  );
}
