export interface ModuleDef {
  key: string;
  nav: unknown[];
  routePrefixes: string[];
  public?: boolean;
  roles?: string[];
  adminOnly?: boolean;
  multiOrgRoles?: string[];
}

export function defineModule(definition: ModuleDef): ModuleDef {
  return definition;
}
