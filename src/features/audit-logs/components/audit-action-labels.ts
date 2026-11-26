import type { ModuleDef } from "@/shared/lib/modules/define-module";

export function findAuditActionLabel(
  action: string,
  modules: readonly ModuleDef[],
): { namespace: string; labelKey: string } | null {
  for (const moduleDef of modules) {
    const declared = moduleDef.auditActions?.find(
      (candidate) => candidate.action === action,
    );
    if (declared) {
      return { namespace: moduleDef.key, labelKey: declared.labelKey };
    }
  }
  return null;
}
