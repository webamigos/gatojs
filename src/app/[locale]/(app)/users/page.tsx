import { setRequestLocale } from "next-intl/server";
import { env } from "@/env";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { isGlobalAdmin } from "@/shared/lib/auth/roles";
import { UsersManager } from "@/features/users/components/users-manager";
import { getUserAccountsQuery } from "@/features/users/services/queries/user-account-queries";
import { OrganizationMembers } from "@/features/organizations/components/organization-members";
import { getOrganizationMembersQuery } from "@/features/organizations/services/queries/organization-queries";

interface UsersPageProps {
  params: Promise<{ locale: string }>;
}

export default async function UsersPage({ params }: UsersPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId, userRole, organizationId, orgRole } =
    await requireModuleAccess("users");

  if (isGlobalAdmin(userRole)) {
    const users = await getUserAccountsQuery();
    return (
      <UsersManager
        users={users}
        currentUserId={userId}
        currentUserRole={userRole}
        adminImpersonation={env.ADMIN_IMPERSONATION}
        organizationId={organizationId}
        currentOrgRole={orgRole}
        multiOrg={env.MULTI_ORG}
      />
    );
  }

  const data = await getOrganizationMembersQuery();
  return (
    <OrganizationMembers
      organizationName={data.organizationName}
      currentUserId={data.currentUserId}
      currentRole={data.currentRole}
      members={data.members}
      invitations={data.invitations}
    />
  );
}
