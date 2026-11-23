import { APIError } from "better-auth/api";
import { defaultLocale, type AppLocale } from "@/i18n/config";
import { getCoreTranslator } from "@/i18n/core-translator";
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

export interface ResolveSignupMembershipInput {
  multiOrg: boolean;
  invitationId: string | null;
  userName: string;
  email?: string;
  locale?: AppLocale;
}

function invalidInvitation(locale: AppLocale): APIError {
  return new APIError("FORBIDDEN", {
    message: getCoreTranslator(locale, "errors")("invitationInvalid"),
  });
}

async function resolveInvitation(
  invitationId: string,
  email: string | undefined,
  locale: AppLocale,
): Promise<SignupMembership> {
  if (!email) {
    throw invalidInvitation(locale);
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
    throw invalidInvitation(locale);
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
  const locale = input.locale ?? defaultLocale;
  if (input.invitationId) {
    return resolveInvitation(input.invitationId, input.email, locale);
  }
  if (input.multiOrg) {
    return {
      action: "create",
      organizationName: getCoreTranslator(locale, "common")(
        "defaultOrganizationName",
        { name: input.userName },
      ),
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
): Promise<void> {
  if (membership.action === "create") {
    await createOrganizationWithOwnerCommand({
      name: membership.organizationName,
      ownerId: userId,
    });
    return;
  }
  await joinOrganizationCommand({
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    invitationId: membership.invitationId,
  });
}
