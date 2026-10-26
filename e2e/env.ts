const dbPort = process.env.DB_PORT ?? "5432";
const mailpitUiPort = process.env.MAILPIT_UI_PORT ?? "8025";
const mailpitSmtpPort = process.env.MAILPIT_SMTP_PORT ?? "1025";

export const E2E_PORTS = {
  core: Number(process.env.E2E_CORE_PORT ?? 3000),
  multiOrg: Number(process.env.E2E_MULTI_ORG_PORT ?? 3001),
};

export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${dbPort}/wa_app_e2e`;

export const MAILPIT_URL =
  process.env.MAILPIT_URL ?? `http://localhost:${mailpitUiPort}`;

export const E2E_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@test.pl",
  password: process.env.E2E_ADMIN_PASSWORD ?? "AdminPassword123!",
};

export function baseUrlFor(port: number): string {
  return `http://localhost:${port}`;
}

export function appEnv(options: {
  port: number;
  multiOrg: boolean;
  publicSignup: boolean;
}): Record<string, string> {
  return {
    PORT: String(options.port),
    HOSTNAME: "localhost",
    DATABASE_URL: E2E_DATABASE_URL,
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ??
      "e2e-secret-key-at-least-32-characters-long",
    BETTER_AUTH_URL: baseUrlFor(options.port),
    // WHY: production mode requires RESEND_API_KEY; SMTP_URL takes precedence, so this key is never used.
    RESEND_API_KEY: "re_e2e_unused",
    SMTP_URL: process.env.SMTP_URL ?? `smtp://localhost:${mailpitSmtpPort}`,
    EMAIL_FROM: "WA App <noreply@test.pl>",
    AUTH_PUBLIC_SIGNUP: String(options.publicSignup),
    MULTI_ORG: String(options.multiOrg),
    LOG_LEVEL: "warn",
  };
}
