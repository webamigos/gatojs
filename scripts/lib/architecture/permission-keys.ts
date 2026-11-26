import type { ModuleDef } from "../../../src/shared/lib/modules/define-module";

function isNamespaced(moduleKey: string, permissionKey: string): boolean {
  const prefix = `${moduleKey}.`;
  return (
    permissionKey.startsWith(prefix) && permissionKey.length > prefix.length
  );
}

export function permissionKeyProblems(modules: readonly ModuleDef[]): string[] {
  return modules.flatMap((moduleDef) =>
    Object.keys(moduleDef.permissions ?? {})
      .filter((permissionKey) => !isNamespaced(moduleDef.key, permissionKey))
      .map(
        (permissionKey) =>
          `${moduleDef.key}: permission key "${permissionKey}" must start with "${moduleDef.key}."`,
      ),
  );
}
