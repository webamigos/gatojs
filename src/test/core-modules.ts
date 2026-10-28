import { clientModules } from "@/modules.client.generated";

export const CORE_MODULE_KEYS = [
  "account",
  "auth",
  "dashboard",
  "organizations",
  "users",
] as const;

export const coreClientModules = clientModules.filter((moduleDef) =>
  (CORE_MODULE_KEYS as readonly string[]).includes(moduleDef.key),
);
