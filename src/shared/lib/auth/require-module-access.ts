import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { env } from "@/env";
import {
  getOrgContext,
  NoOrganizationError,
  type OrgContext,
} from "./org-context";
import { ModuleAccessDeniedError } from "./module-access-denied-error";
import { canAccessModule, moduleByKey } from "./permissions";
import { currentRequestPrincipal } from "./request-principal";

async function resolveOrgContext(): Promise<OrgContext> {
  if (currentRequestPrincipal()) {
    return getOrgContext();
  }
  try {
    return await getOrgContext();
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      return redirect({ href: "/no-organization", locale: await getLocale() });
    }
    throw error;
  }
}

export async function requireModuleAccess(
  moduleKey: string,
): Promise<OrgContext> {
  const context = await resolveOrgContext();
  const moduleDef = moduleByKey(moduleKey);
  const allowed =
    moduleDef !== null &&
    canAccessModule(moduleDef, {
      userRole: context.userRole,
      orgRole: context.orgRole,
      multiOrg: env.MULTI_ORG,
    });
  if (!allowed && currentRequestPrincipal()) {
    throw new ModuleAccessDeniedError(moduleKey);
  }
  if (!allowed) {
    notFound();
  }
  return context;
}
