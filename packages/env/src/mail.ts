import type { CoreEnv } from "./core-env-schema";
import { allOrNone, requiredForProvider, type EnvRule } from "./rules";

export const MAIL_PROVIDERS = ["smtp", "resend", "console"] as const;

export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export type SmtpOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
};

export type MailConfig =
  | { provider: "smtp"; transport: string }
  | { provider: "smtp"; transport: SmtpOptions }
  | { provider: "resend"; apiKey: string }
  | { provider: "console"; explicit: boolean };

export type MailEnv = Pick<
  CoreEnv,
  | "MAIL_PROVIDER"
  | "SMTP_URL"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "SMTP_SECURE"
  | "RESEND_API_KEY"
>;

const SMTP_URL_EXCLUDES = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
] as const;

function detectProvider(env: MailEnv): MailProvider | undefined {
  if (env.SMTP_URL || env.SMTP_HOST) {
    return "smtp";
  }
  return env.RESEND_API_KEY ? "resend" : undefined;
}

function smtpConfig(env: MailEnv): MailConfig {
  if (env.SMTP_URL) {
    return { provider: "smtp", transport: env.SMTP_URL };
  }
  if (!env.SMTP_HOST) {
    throw new Error(
      'MAIL_PROVIDER is "smtp" but neither SMTP_HOST nor SMTP_URL is set',
    );
  }
  const options: SmtpOptions = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
  };
  if (env.SMTP_USER && env.SMTP_PASS) {
    options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASS };
  }
  return { provider: "smtp", transport: options };
}

export function resolveMailConfig(env: MailEnv): MailConfig {
  const provider = env.MAIL_PROVIDER ?? detectProvider(env);
  if (provider === "smtp") {
    return smtpConfig(env);
  }
  if (provider === "resend") {
    if (!env.RESEND_API_KEY) {
      throw new Error(
        'MAIL_PROVIDER is "resend" but RESEND_API_KEY is not set',
      );
    }
    return { provider, apiKey: env.RESEND_API_KEY };
  }
  return { provider: "console", explicit: provider === "console" };
}

function isSet(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function normalized(value: unknown): string | undefined {
  return isSet(value) ? String(value).trim().toLowerCase() : undefined;
}

const smtpNeedsHostOrUrl: EnvRule = (env, ctx) => {
  if (
    normalized(env.MAIL_PROVIDER) === "smtp" &&
    !isSet(env.SMTP_HOST) &&
    !isSet(env.SMTP_URL)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["SMTP_HOST"],
      message: 'SMTP_HOST or SMTP_URL is required when MAIL_PROVIDER is "smtp"',
    });
  }
};

const smtpUrlExcludesSplitSettings: EnvRule = (env, ctx) => {
  if (!isSet(env.SMTP_URL)) {
    return;
  }
  for (const name of SMTP_URL_EXCLUDES.filter((name) => isSet(env[name]))) {
    ctx.addIssue({
      code: "custom",
      path: [name],
      message: `SMTP_URL is set: drop ${name}, or drop SMTP_URL and use ${name}`,
    });
  }
};

const productionNeedsProvider: EnvRule = (env, ctx) => {
  const configured = [
    "MAIL_PROVIDER",
    "SMTP_HOST",
    "SMTP_URL",
    "RESEND_API_KEY",
  ];
  if (
    env.NODE_ENV === "production" &&
    !configured.some((name) => isSet(env[name]))
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["MAIL_PROVIDER"],
      message:
        "no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail",
    });
  }
};

const mailRuleList: readonly EnvRule[] = [
  productionNeedsProvider,
  requiredForProvider("MAIL_PROVIDER", "resend", ["RESEND_API_KEY"]),
  smtpNeedsHostOrUrl,
  smtpUrlExcludesSplitSettings,
  allOrNone(["SMTP_USER", "SMTP_PASS"], "SMTP authentication"),
];

export const mailRules: EnvRule = (env, ctx) => {
  for (const rule of mailRuleList) {
    rule(env, ctx);
  }
};
