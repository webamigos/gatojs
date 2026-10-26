import type { OrgRole } from "@/shared/lib/auth/roles";

export interface ModuleNavItem {
  href: string;
  labelKey: string;
  icon: string;
  order: number;
}

export interface ModuleDef {
  key: string;
  nav: ModuleNavItem[];
  routePrefixes: string[];
  roles?: OrgRole[];
  public?: boolean;
  adminOnly?: boolean;
  multiOrgRoles?: OrgRole[];
}

export function defineModule<T extends ModuleDef>(definition: T): T {
  return definition;
}
