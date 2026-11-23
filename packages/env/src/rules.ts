import type { z } from "zod";

export type EnvRule = (
  env: Record<string, unknown>,
  ctx: z.RefinementCtx,
) => void;

function isSet(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function allOrNone(names: readonly string[], label: string): EnvRule {
  return (env, ctx) => {
    const missing = names.filter((name) => !isSet(env[name]));
    if (missing.length === 0 || missing.length === names.length) {
      return;
    }
    ctx.addIssue({
      code: "custom",
      path: [names[0]],
      message: `${label} is half-configured: ${names.join(", ")} must all be set or all be omitted (missing: ${missing.join(", ")})`,
    });
  };
}

export function requiredForProvider(
  providerVar: string,
  value: string,
  names: readonly string[],
): EnvRule {
  return (env, ctx) => {
    const provider = env[providerVar];
    if (
      typeof provider !== "string" ||
      provider.trim().toLowerCase() !== value
    ) {
      return;
    }
    for (const name of names) {
      if (!isSet(env[name])) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required when ${providerVar} is "${value}"`,
        });
      }
    }
  };
}
