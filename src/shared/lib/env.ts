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

export function parseEnv(source: Record<string, string | undefined>): CoreEnv {
  const result = fullSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Nieprawidłowe zmienne środowiskowe: ${details}`);
  }
  return result.data;
}

let cachedEnv: CoreEnv | undefined;

// WHY: lazy, so importing env does not throw during `next build` or in tests without a full environment.
export const env = new Proxy({} as CoreEnv, {
  get(_target, key) {
    cachedEnv ??= parseEnv(process.env);
    return cachedEnv[key as keyof CoreEnv];
  },
});
