import "server-only";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { USER_ROLES } from "@/shared/lib/auth/roles";

async function readSession() {
  const { auth } = await import("@/shared/lib/auth");
  return auth.api.getSession({ headers: await headers() });
}

export async function getCurrentUser() {
  const session = await readSession();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return redirect({ href: "/sign-in", locale: await getLocale() });
  }
  return user;
}

export async function getAdminUserOrNull() {
  const user = await requireUser();
  return user.role === USER_ROLES.ADMIN ? user : null;
}

export async function getImpersonatedByUserId(): Promise<string | null> {
  const session = await readSession();
  const sessionRow = session?.session as
    { impersonatedBy?: string | null } | undefined;
  return sessionRow?.impersonatedBy ?? null;
}

export async function getCurrentUserWithImpersonation(): Promise<{
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  impersonatedBy: string | null;
}> {
  const session = await readSession();
  const sessionRow = session?.session as
    { impersonatedBy?: string | null } | undefined;
  return {
    user: session?.user ?? null,
    impersonatedBy: sessionRow?.impersonatedBy ?? null,
  };
}
