import { z } from "zod";
import { blankAsUndefined, flag, httpUrl } from "./fragments";

const SECRET_MIN_LENGTH = 32;

export const EXAMPLE_BETTER_AUTH_SECRET =
  "change-me-to-a-random-string-of-at-least-32-chars";

function optionalString() {
  return blankAsUndefined(z.string().optional());
}

export const coreEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z
      .string()
      .refine((value) => value.trim().length >= SECRET_MIN_LENGTH, {
        message: `at least ${SECRET_MIN_LENGTH} characters, no leading or trailing spaces`,
      }),
    APP_URL: httpUrl(),
    RESEND_API_KEY: optionalString(),
    SMTP_URL: optionalString(),
    EMAIL_FROM: z.string().min(1),
    AUTH_PUBLIC_SIGNUP: flag(),
    MULTI_ORG: flag(),
    ADMIN_IMPERSONATION: flag(),
    ADMIN_EMAIL: optionalString(),
    ADMIN_PASSWORD: optionalString(),
    LOG_LEVEL: optionalString(),
    OTEL_EXPORTER_OTLP_ENDPOINT: blankAsUndefined(httpUrl().optional()),
  })
  .refine((value) => value.NODE_ENV !== "production" || value.RESEND_API_KEY, {
    path: ["RESEND_API_KEY"],
    message: "required in production",
  })
  .refine(
    (value) =>
      value.NODE_ENV !== "production" ||
      value.BETTER_AUTH_SECRET !== EXAMPLE_BETTER_AUTH_SECRET,
    {
      path: ["BETTER_AUTH_SECRET"],
      message: "must not be the .env.example value in production",
    },
  );

export type CoreEnv = z.infer<typeof coreEnvSchema>;
