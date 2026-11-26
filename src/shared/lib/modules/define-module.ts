import type { OrgRole } from "@/shared/lib/auth/roles";

export interface ModuleNavItem {
  id?: string;
  href: string;
  labelKey: string;
  multiOrgLabelKey?: string;
  icon: string;
  order: number;
}

export interface ModuleAuditAction {
  action: string;
  labelKey: string;
}

export interface ModuleApiScope {
  key: string;
  labelKey: string;
}

export interface ModuleUploadPurpose {
  key: string;
  mimeTypes: readonly string[];
  maxBytes: number;
  visibility: "public" | "organization";
  resizeImage?: { maxWidth: number };
}

export interface ModulePermission {
  defaultRoles: OrgRole[];
  labelKey: string;
}

export interface ModuleDef {
  key: string;
  nav: ModuleNavItem[];
  routePrefixes: string[];
  roles?: OrgRole[];
  public?: boolean;
  adminOnly?: boolean;
  multiOrgRoles?: OrgRole[];
  auditActions?: ModuleAuditAction[];
  apiScopes?: ModuleApiScope[];
  uploadPurposes?: ModuleUploadPurpose[];
  permissions?: Record<string, ModulePermission>;
}

export function defineModule<T extends ModuleDef>(definition: T): T {
  return definition;
}
