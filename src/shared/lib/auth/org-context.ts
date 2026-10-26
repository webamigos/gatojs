import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { prisma } from "@/shared/lib/prisma";
import { toOrgRole, toUserRole, type OrgRole, type UserRole } from "./roles";

export class NoOrganizationError extends Error {
  constructor() {
    super("Użytkownik nie należy do aktywnej organizacji");
    this.name = "NoOrganizationError";
  }
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  orgRole: OrgRole;
  userRole: UserRole;
}

async function readSession() {
  const requestHeaders = await headers();
  const { auth } = await import("@/shared/lib/auth");
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user || session.session.activeOrganizationId) {
    return session;
  }
  // WHY: the 5-minute cookie cache can hold a session from before an org was joined or activated server-side.
  return auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
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
  const member = await prisma.member.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member) {
    throw new NoOrganizationError();
  }
  return {
    userId: session.user.id,
    organizationId,
    orgRole: toOrgRole(member.role),
    userRole: toUserRole(session.user.role),
  };
}
