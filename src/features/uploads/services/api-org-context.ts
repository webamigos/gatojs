import { headers } from "next/headers";
import {
  getOrgContext,
  NoOrganizationError,
} from "@/shared/lib/auth/org-context";
import type { ApiOrgContextResult } from "../contracts/upload.types";

async function hasSession(): Promise<boolean> {
  const { auth } = await import("@/shared/lib/auth");
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  return Boolean(session?.user);
}

export async function readOrgContextForApi(): Promise<ApiOrgContextResult> {
  if (!(await hasSession())) {
    return { ok: false, status: 401 };
  }
  try {
    return { ok: true, context: await getOrgContext() };
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      return { ok: false, status: 403 };
    }
    throw error;
  }
}
