import { z } from "zod";
import { blankAsUndefined, flag, httpUrl } from "./fragments";
import { MAIL_PROVIDERS, mailRules } from "./mail";

const SECRET_MIN_LENGTH = 32;
const DEFAULT_SMTP_PORT = 587;
const MAX_PORT = 65535;

export const EXAMPLE_BETTER_AUTH_SECRET =
  "change-me-to-a-random-string-of-at-least-32-chars";

function optionalString() {
  return blankAsUndefined(z.string().optional());
}

function mailProvider() {
  return blankAsUndefined(
    z
      .string()
      .transform((value) => value.trim().toLowerCase())
      .pipe(z.enum(MAIL_PROVIDERS))
      .optional(),
  );
}

function smtpPort() {
  return blankAsUndefined(
    z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_SMTP_PORT),
  );
}

// WHY: the mail rules read the raw variables: parsed SMTP_PORT and SMTP_SECURE have
// defaults, which must not count as set next to SMTP_URL. The empty output merges
// with the parsed object, and overwrite runs even when a rule reported an issue.
const rawMailRules = z
  .unknown()
  .superRefine((source, ctx) =>
    mailRules(source as Record<string, unknown>, ctx),
  )
  .overwrite(() => ({}));

const coreEnvObject = z
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
    MAIL_PROVIDER: mailProvider(),
    RESEND_API_KEY: optionalString(),
    SMTP_URL: optionalString(),
    SMTP_HOST: optionalString(),
    SMTP_PORT: smtpPort(),
    SMTP_USER: optionalString(),
    SMTP_PASS: optionalString(),
    SMTP_SECURE: flag(),
    EMAIL_FROM: z.string().min(1),
    AUTH_PUBLIC_SIGNUP: flag(),
    MULTI_ORG: flag(),
    ADMIN_IMPERSONATION: flag(),
    ADMIN_EMAIL: optionalString(),
    ADMIN_PASSWORD: optionalString(),
    LOG_LEVEL: optionalString(),
    OTEL_EXPORTER_OTLP_ENDPOINT: blankAsUndefined(httpUrl().optional()),
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

export const coreEnvSchema = z.intersection(coreEnvObject, rawMailRules);

export type CoreEnv = z.infer<typeof coreEnvSchema>;
