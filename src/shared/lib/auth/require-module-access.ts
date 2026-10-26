import { notFound } from "next/navigation";
import { env } from "@/shared/lib/env";
import { getOrgContext, type OrgContext } from "./org-context";
import { canAccessModule, moduleByKey } from "./permissions";

export async function requireModuleAccess(
  moduleKey: string,
): Promise<OrgContext> {
  const context = await getOrgContext();
  const moduleDef = moduleByKey(moduleKey);
  const allowed =
    moduleDef !== null &&
    canAccessModule(moduleDef, {
      userRole: context.userRole,
      orgRole: context.orgRole,
      multiOrg: env.MULTI_ORG,
    });
  if (!allowed) {
    notFound();
  }
  return context;
}
