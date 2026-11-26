import type { ModuleDef } from "@/shared/lib/modules/define-module";

export function findApiScopeLabel(
  scope: string,
  modules: readonly ModuleDef[],
): { namespace: string; labelKey: string } | null {
  for (const moduleDef of modules) {
    const declared = moduleDef.apiScopes?.find(
      (candidate) => candidate.key === scope,
    );
    if (declared) {
      return { namespace: moduleDef.key, labelKey: declared.labelKey };
    }
  }
  return null;
}
