import { clientModules } from "@/modules.client.generated";
import {
  canAccessModule,
  type AccessContext,
} from "@/shared/lib/auth/permissions";
import type { ModuleDef } from "./define-module";

export interface NavEntry {
  href: string;
  labelPath: string;
  icon: string;
  order: number;
}

const registry: readonly ModuleDef[] = clientModules;

export function getNavEntries(
  context: AccessContext,
  modules: readonly ModuleDef[] = registry,
): NavEntry[] {
  const showMembersLabel = context.multiOrg && context.userRole !== "admin";
  return modules
    .filter((moduleDef) => canAccessModule(moduleDef, context))
    .flatMap((moduleDef) =>
      moduleDef.nav.map((item) => ({
        href: item.href,
        labelPath: `${moduleDef.key}.${
          showMembersLabel && item.multiOrgLabelKey
            ? item.multiOrgLabelKey
            : item.labelKey
        }`,
        icon: item.icon,
        order: item.order,
      })),
    )
    .sort((a, b) => a.order - b.order);
}

export function isActiveEntry(
  pathname: string,
  href: string,
  entries: readonly NavEntry[],
): boolean {
  if (pathname === href) {
    return true;
  }
  if (!pathname.startsWith(`${href}/`)) {
    return false;
  }
  return !entries.some(
    (other) =>
      other.href !== href &&
      other.href.length > href.length &&
      (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}
