import { z } from "zod";
import { coreEnvSchema, type CoreEnv } from "./core-env-schema";

export type EnvSource = Record<string, string | undefined>;

export interface EnvIssue {
  name: string;
  message: string;
}

export type EnvCheck =
  { ok: true; env: CoreEnv } | { ok: false; issues: EnvIssue[] };

export interface StartupIo {
  error: (message: string) => void;
  exit: (code: number) => void;
}

const NEXT_PRODUCTION_BUILD_PHASE = "phase-production-build";

function fullSchema(moduleSchemas: readonly z.ZodType[]): z.ZodType<CoreEnv> {
  return moduleSchemas.reduce<z.ZodType<CoreEnv>>(
    (schema, moduleSchema) =>
      z.intersection(schema, moduleSchema) as unknown as z.ZodType<CoreEnv>,
    coreEnvSchema,
  );
}

export function checkEnv(
  source: EnvSource,
  moduleSchemas: readonly z.ZodType[],
): EnvCheck {
  const result = fullSchema(moduleSchemas).safeParse(source);
  if (result.success) {
    return { ok: true, env: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      name: issue.path.join(".") || "(env)",
      message: issue.message,
    })),
  };
}

export function formatEnvReport(issues: readonly EnvIssue[]): string {
  return [
    `Nieprawidłowe zmienne środowiskowe (${issues.length}):`,
    ...issues.map(({ name, message }) => `- ${name}: ${message}`),
  ].join("\n");
}

export function parseEnv(
  source: EnvSource,
  moduleSchemas: readonly z.ZodType[],
): CoreEnv {
  const result = checkEnv(source, moduleSchemas);
  if (!result.ok) {
    const details = result.issues
      .map(({ name, message }) => `${name}: ${message}`)
      .join("; ");
    throw new Error(`Nieprawidłowe zmienne środowiskowe: ${details}`);
  }
  return result.env;
}

export function verifyEnvOnStartup(
  source: EnvSource,
  io: StartupIo,
  moduleSchemas: readonly z.ZodType[],
): void {
  if (source.NEXT_PHASE === NEXT_PRODUCTION_BUILD_PHASE) {
    return;
  }
  const result = checkEnv(source, moduleSchemas);
  if (!result.ok) {
    io.error(formatEnvReport(result.issues));
    io.exit(1);
  }
}

// WHY: keeps process.exit out of instrumentation.ts, which Turbopack also compiles for Edge and warns about.
export const processStartupIo: StartupIo = {
  error: (message: string) => console.error(message),
  exit: (code: number) => process.exit(code),
};
