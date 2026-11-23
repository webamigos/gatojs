import type { z } from "zod";
import { parseEnv } from "./check-env";
import type { CoreEnv } from "./core-env-schema";

// WHY: lazy, so importing env does not throw during `next build` or in tests without a full environment.
export function createEnv(moduleSchemas: readonly z.ZodType[]): CoreEnv {
  let cachedEnv: CoreEnv | undefined;
  return new Proxy({} as CoreEnv, {
    get(_target, key) {
      cachedEnv ??= parseEnv(process.env, moduleSchemas);
      return cachedEnv[key as keyof CoreEnv];
    },
  });
}
