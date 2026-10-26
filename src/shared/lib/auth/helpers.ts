"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/shared/lib/auth";
import { USER_ROLES } from "@/shared/lib/auth/roles";

export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  return user.role === USER_ROLES.ADMIN ? user : null;
}

export async function getImpersonatedByUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const sessionRow = session?.session as
    { impersonatedBy?: string | null } | undefined;
  return sessionRow?.impersonatedBy ?? null;
}

export async function getCurrentUserWithImpersonation(): Promise<{
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  impersonatedBy: string | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  const sessionRow = session?.session as
    { impersonatedBy?: string | null } | undefined;
  return {
    user: session?.user ?? null,
    impersonatedBy: sessionRow?.impersonatedBy ?? null,
  };
}
