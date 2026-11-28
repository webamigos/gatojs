import { APIError } from "better-auth/api";
import { prisma } from "@/shared/lib/prisma";
import { ORG_ROLES, toOrgRole, type OrgRole } from "@/shared/lib/auth/roles";
import { joinOrganizationCommand } from "./commands/member-commands";
import { createOrganizationWithOwnerCommand } from "./commands/organization-commands";

export const NOT_CONFIGURED_MESSAGE =
  "Aplikacja nie jest skonfigurowana: uruchom npm run admin:create";

export type SignupMembership =
  | {
      action: "join";
      organizationId: string;
      role: OrgRole;
      invitationId?: string;
    }
  | { action: "create"; organizationName: string; role: "owner" };

export interface AppliedSignupMembership {
  organizationId: string;
  memberId: string | null;
}

export interface ResolveSignupMembershipInput {
  multiOrg: boolean;
  invitationId: string | null;
  userName: string;
  email?: string;
}

function invalidInvitation(): APIError {
  return new APIError("FORBIDDEN", {
    message: "Zaproszenie jest nieprawidłowe lub wygasło",
  });
}

async function resolveInvitation(
  invitationId: string,
  email: string | undefined,
): Promise<SignupMembership> {
  if (!email) {
    throw invalidInvitation();
  }
  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      email: { equals: email, mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: { id: true, organizationId: true, role: true },
  });
  if (!invitation) {
    throw invalidInvitation();
  }
  return {
    action: "join",
    organizationId: invitation.organizationId,
    role: toOrgRole(invitation.role),
    invitationId: invitation.id,
  };
}

export async function resolveSignupMembership(
  input: ResolveSignupMembershipInput,
): Promise<SignupMembership> {
  if (input.invitationId) {
    return resolveInvitation(input.invitationId, input.email);
  }
  if (input.multiOrg) {
    return {
      action: "create",
      organizationName: `${input.userName} — organizacja`,
      role: ORG_ROLES.OWNER,
    };
  }
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!organization) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: NOT_CONFIGURED_MESSAGE,
    });
  }
  return {
    action: "join",
    organizationId: organization.id,
    role: ORG_ROLES.MEMBER,
  };
}

export async function applySignupMembership(
  userId: string,
  membership: SignupMembership,
): Promise<AppliedSignupMembership> {
  if (membership.action === "create") {
    const organization = await createOrganizationWithOwnerCommand({
      name: membership.organizationName,
      ownerId: userId,
    });
    return { organizationId: organization.id, memberId: null };
  }
  const { memberId } = await joinOrganizationCommand({
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    invitationId: membership.invitationId,
  });
  return { organizationId: membership.organizationId, memberId };
}
