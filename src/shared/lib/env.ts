import { z } from "zod";
import { moduleEnvSchemas } from "@/modules.generated";

const flag = z
  .string()
  .optional()
  .transform((value) => value === "true");

export const coreEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),
    SMTP_URL: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1),
    AUTH_PUBLIC_SIGNUP: flag,
    MULTI_ORG: flag,
    ADMIN_EMAIL: z.string().min(1).optional(),
    ADMIN_PASSWORD: z.string().min(1).optional(),
    LOG_LEVEL: z.string().min(1).optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).optional(),
  })
  .refine((value) => value.NODE_ENV !== "production" || value.RESEND_API_KEY, {
    path: ["RESEND_API_KEY"],
    message: "wymagana w produkcji",
  });

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
