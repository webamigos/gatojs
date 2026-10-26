import { setRequestLocale } from "next-intl/server";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { USER_ROLES } from "@/shared/lib/auth/roles";
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

  const { userId, userRole } = await requireModuleAccess("users");

  if (userRole === USER_ROLES.ADMIN) {
    const users = await getUserAccountsQuery();
    return <UsersManager users={users} currentUserId={userId} />;
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
