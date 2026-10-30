import { env, type CoreEnv } from "@/shared/lib/env";
import type { ApiKeysEnv } from "../env";

export function apiKeyPepper(): string {
  return (env as CoreEnv & ApiKeysEnv).API_KEY_PEPPER;
}
