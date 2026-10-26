import { prisma } from "@/shared/lib/prisma";
import { getOrgContext } from "@/shared/lib/auth/org-context";
import type { OrgRole } from "@/shared/lib/auth/roles";
import type {
  OrganizationInvitationRow,
  OrganizationMemberRow,
} from "../../contracts/organization-members.types";

export interface OrganizationMembersData {
  organizationName: string;
  currentUserId: string;
  currentRole: OrgRole;
  members: OrganizationMemberRow[];
  invitations: OrganizationInvitationRow[];
}

export async function getOrganizationMembersQuery(): Promise<OrganizationMembersData> {
  const { userId, organizationId, orgRole } = await getOrgContext();

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      name: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      invitations: {
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
        },
      },
    },
  });

  return {
    organizationName: organization.name,
    currentUserId: userId,
    currentRole: orgRole,
    members: organization.members.map((member) => ({
      memberId: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
    })),
    invitations: organization.invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
    })),
  };
}
