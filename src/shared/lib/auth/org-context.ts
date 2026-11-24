import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { prisma } from "@/shared/lib/prisma";
import {
  ORG_ROLES,
  toOrgRole,
  toUserRole,
  USER_ROLES,
  type OrgRole,
  type UserRole,
} from "./roles";

export class NoOrganizationError extends Error {
  constructor() {
    super("User is not a member of the active organization");
    this.name = "NoOrganizationError";
  }
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  orgRole: OrgRole;
  userRole: UserRole;
  serviceMode: boolean;
}

async function readSession() {
  const requestHeaders = await headers();
  const { auth } = await import("@/shared/lib/auth");
  // WHY: the active org is switched server-side, so the 5-minute cookie cache can hold a stale one.
  return auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
}

async function organizationExists(organizationId: string): Promise<boolean> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  return organization !== null;
}

export async function getOrgContext(): Promise<OrgContext> {
  const session = await readSession();
  if (!session?.user) {
    return redirect({ href: "/sign-in", locale: await getLocale() });
  }
  const organizationId = session.session.activeOrganizationId ?? null;
  if (!organizationId) {
    throw new NoOrganizationError();
  }
  const userRole = toUserRole(session.user.role);
  const member = await prisma.member.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (member) {
    return {
      userId: session.user.id,
      organizationId,
      orgRole: toOrgRole(member.role),
      userRole,
      serviceMode: false,
    };
  }
  if (
    userRole === USER_ROLES.SUPERADMIN &&
    (await organizationExists(organizationId))
  ) {
    return {
      userId: session.user.id,
      organizationId,
      orgRole: ORG_ROLES.OWNER,
      userRole,
      serviceMode: true,
    };
  }
  throw new NoOrganizationError();
}
