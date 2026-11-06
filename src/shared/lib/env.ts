import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { z } from "zod";
import { moduleEnvSchemas } from "@/modules.generated";

const flag = z
  .string()
  .optional()
  .transform((value) => value?.trim().toLowerCase() ?? "")
  .pipe(z.enum(["", "true", "false"]))
  .transform((value) => value === "true");

const SECRET_MIN_LENGTH = 32;

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

export const EXAMPLE_BETTER_AUTH_SECRET =
  "change-me-to-a-random-string-of-at-least-32-chars";

export const coreEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z
      .string()
      .refine((value) => value.trim().length >= SECRET_MIN_LENGTH, {
        message: `co najmniej ${SECRET_MIN_LENGTH} znaki bez spacji na brzegach`,
      }),
    APP_URL: z.url({ protocol: /^https?$/ }),
    RESEND_API_KEY: optionalString,
    SMTP_URL: optionalString,
    EMAIL_FROM: z.string().min(1),
    AUTH_PUBLIC_SIGNUP: flag,
    MULTI_ORG: flag,
    ADMIN_IMPERSONATION: flag,
    ADMIN_EMAIL: optionalString,
    ADMIN_PASSWORD: optionalString,
    LOG_LEVEL: optionalString,
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,
  })
  .refine((value) => value.NODE_ENV !== "production" || value.RESEND_API_KEY, {
    path: ["RESEND_API_KEY"],
    message: "wymagana w produkcji",
  })
  .refine(
    (value) =>
      value.NODE_ENV !== "production" ||
      value.BETTER_AUTH_SECRET !== EXAMPLE_BETTER_AUTH_SECRET,
    {
      path: ["BETTER_AUTH_SECRET"],
      message: "w produkcji nie może być wartością z .env.example",
    },
  );

export type CoreEnv = z.infer<typeof coreEnvSchema>;

const moduleSchemas = moduleEnvSchemas as readonly z.ZodType<
  Record<string, unknown>
>[];

const fullSchema = moduleSchemas.reduce<z.ZodType<CoreEnv>>(
  (schema, moduleSchema) =>
    z.intersection(schema, moduleSchema) as unknown as z.ZodType<CoreEnv>,
  coreEnvSchema,
);

export interface EnvIssue {
  name: string;
  message: string;
}

export type EnvCheck =
  { ok: true; env: CoreEnv } | { ok: false; issues: EnvIssue[] };

export function checkEnv(source: Record<string, string | undefined>): EnvCheck {
  const result = fullSchema.safeParse(source);
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

export function parseEnv(source: Record<string, string | undefined>): CoreEnv {
  const result = checkEnv(source);
  if (!result.ok) {
    const details = result.issues
      .map(({ name, message }) => `${name}: ${message}`)
      .join("; ");
    throw new Error(`Nieprawidłowe zmienne środowiskowe: ${details}`);
  }
  return result.env;
}

export function verifyEnvOnStartup(
  source: Record<string, string | undefined>,
  io: { error: (message: string) => void; exit: (code: number) => void },
): void {
  if (source.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return;
  }
  const result = checkEnv(source);
  if (!result.ok) {
    io.error(formatEnvReport(result.issues));
    io.exit(1);
  }
}

// WHY: keeps process.exit out of instrumentation.ts, which Turbopack also compiles for Edge and warns about.
export const processStartupIo = {
  error: (message: string) => console.error(message),
  exit: (code: number) => process.exit(code),
};

let cachedEnv: CoreEnv | undefined;

// WHY: lazy, so importing env does not throw during `next build` or in tests without a full environment.
export const env = new Proxy({} as CoreEnv, {
  get(_target, key) {
    cachedEnv ??= parseEnv(process.env);
    return cachedEnv[key as keyof CoreEnv];
  },
});
