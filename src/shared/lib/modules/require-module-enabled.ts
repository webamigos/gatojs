import { moduleByKey } from "@/shared/lib/auth/permissions";
import { UNDISABLEABLE_MODULES } from "./gato-config";
import { ModuleDisabledError } from "./module-disabled-error";

export { ModuleDisabledError };

export function isModuleEnabled(key: string): boolean {
  return UNDISABLEABLE_MODULES.includes(key) || moduleByKey(key) !== null;
}

export function requireModuleEnabled(key: string): void {
  if (!isModuleEnabled(key)) {
    throw new ModuleDisabledError(key);
  }
}
