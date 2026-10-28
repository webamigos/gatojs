import "server-only";

import { headers } from "next/headers";
import { prisma } from "@/shared/lib/prisma";
import { toUserRole, USER_ROLES } from "@/shared/lib/auth/roles";
import type { SwitchableOrganization } from "../../contracts/organization-switcher.types";

export async function getSwitchableOrganizationsQuery(): Promise<
  SwitchableOrganization[]
> {
  const { auth } = await import("@/shared/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return [];
  }
  const userId = session.user.id;

  if (toUserRole(session.user.role) === USER_ROLES.SUPERADMIN) {
    const organizations = await prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        members: { where: { userId }, select: { id: true } },
      },
    });
    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      isMember: organization.members.length > 0,
    }));
  }

  const memberships = await prisma.member.findMany({
    where: { userId },
    orderBy: { organization: { name: "asc" } },
    select: { organization: { select: { id: true, name: true } } },
  });
  return memberships.map(({ organization }) => ({
    id: organization.id,
    name: organization.name,
    isMember: true,
  }));
}
