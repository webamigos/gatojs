import { APIError } from "better-auth/api";
import { defaultLocale, type AppLocale } from "@/i18n/config";
import { getCoreTranslator } from "@/i18n/core-translator";
import { isGlobalAdmin } from "./roles";

const SINGLE_ORG_GLOBAL_ADMIN_PATHS: ReadonlySet<string> = new Set([
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/create-team",
  "/organization/update-team",
  "/organization/remove-team",
  "/organization/add-team-member",
  "/organization/remove-team-member",
  "/organization/create-role",
  "/organization/update-role",
  "/organization/delete-role",
]);

export function requiresGlobalAdminInSingleOrg(
  path: string,
  multiOrg: boolean,
): boolean {
  return !multiOrg && SINGLE_ORG_GLOBAL_ADMIN_PATHS.has(path);
}

export function assertGlobalAdmin(
  role: unknown,
  locale: AppLocale = defaultLocale,
): void {
  if (!isGlobalAdmin(role)) {
    throw new APIError("FORBIDDEN", {
      message: getCoreTranslator(
        locale,
        "errors",
      )("orgManagementRequiresAdmin"),
    });
  }
}
