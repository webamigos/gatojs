import type {
  CreateCliArgs,
  Locale,
  MailProvider,
  StorageProvider,
} from "./args.js";
import { withRequired, type KitModule } from "./kit-modules.js";
import {
  adminEmailError,
  envValueError,
  parsePort,
  PORT_ERROR,
  titleError,
} from "./validate.js";

export const LOCAL_MINIO_ENDPOINT = "http://localhost:9000";
export const LOCAL_MINIO_KEY = "minioadmin";
export const HTTP_URL_ERROR = "expected an http(s) URL";
export const LOCAL_MAILPIT_HOST = "127.0.0.1";
export const DEFAULT_SMTP_PORT = 587;

export class CancelledError extends Error {
  name = "CancelledError";
}

export type Option<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

export type Prompter = {
  multiselect(input: {
    message: string;
    options: Option<string>[];
    initialValues: string[];
  }): Promise<string[]>;
  text(input: {
    message: string;
    defaultValue: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  password(input: {
    message: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  select<T extends string>(input: {
    message: string;
    options: Option<T>[];
    initialValue: T;
  }): Promise<T>;
  confirm(input: { message: string; initialValue: boolean }): Promise<boolean>;
};

export type StorageAnswer =
  | { provider: "local" }
  | {
      provider: "s3";
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
      localMinio: boolean;
    };

export type MailAnswer =
  | { provider: "smtp"; localMailpit: true }
  | {
      provider: "smtp";
      localMailpit: false;
      host: string;
      port: number;
      user: string | null;
      pass: string | null;
    }
  | { provider: "resend"; apiKey: string }
  | { provider: "console" };

export type Answers = {
  modules: string[];
  locales: Locale[];
  title: string;
  adminEmail: string | null;
  storage: StorageAnswer | null;
  mail: MailAnswer;
  setup: boolean;
};

const UPLOADS = "uploads";
const HTTP_URL = /^https?:\/\/\S+$/;

export function isHttpUrl(value: string): boolean {
  return HTTP_URL.test(value);
}

export function displayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function orUndefined(message: string | null): string | undefined {
  return message ?? undefined;
}

type Context = { args: CreateCliArgs; prompter: Prompter; ask: boolean };

async function askModules(
  { args, prompter, ask }: Context,
  modules: KitModule[],
): Promise<string[]> {
  if (args.modules !== null) {
    return withRequired(args.modules, modules);
  }
  if (!ask || modules.length === 0) {
    return [];
  }
  const chosen = await prompter.multiselect({
    message: "Modules (space to toggle, enter to confirm)",
    options: modules.map((module) => ({
      value: module.name,
      label: module.name,
      hint: module.description,
    })),
    initialValues: [],
  });
  return withRequired(chosen, modules);
}

async function askLocales({ args, prompter, ask }: Context): Promise<Locale[]> {
  if (args.locales !== null) {
    return args.locales;
  }
  if (!ask) {
    return ["pl", "en"];
  }
  const english = await prompter.confirm({
    message: "Add English? Polish is always included.",
    initialValue: true,
  });
  return english ? ["pl", "en"] : ["pl"];
}

async function askTitle(
  { args, prompter, ask }: Context,
  slug: string,
): Promise<string> {
  if (args.title !== null) {
    return args.title;
  }
  if (!ask) {
    return displayName(slug);
  }
  const title = await prompter.text({
    message: "Display name",
    defaultValue: displayName(slug),
    placeholder: displayName(slug),
    validate: (value) => orUndefined(titleError(value)),
  });
  return title.trim() || displayName(slug);
}

async function askAdminEmail({
  args,
  prompter,
  ask,
}: Context): Promise<string | null> {
  if (args.adminEmail !== null) {
    return args.adminEmail;
  }
  if (!ask) {
    return null;
  }
  const email = (
    await prompter.text({
      message: "First admin's email (empty to skip)",
      defaultValue: "",
      validate: (value) =>
        value.trim() === ""
          ? undefined
          : orUndefined(adminEmailError(value.trim())),
    })
  ).trim();
  return email === "" ? null : email;
}

async function askEndpoint({ args, prompter, ask }: Context): Promise<string> {
  if (args.s3Endpoint !== null) {
    return args.s3Endpoint;
  }
  if (!ask) {
    return LOCAL_MINIO_ENDPOINT;
  }
  const endpoint = await prompter.text({
    message: `S3 endpoint (${LOCAL_MINIO_ENDPOINT} = local MinIO started with Docker)`,
    defaultValue: LOCAL_MINIO_ENDPOINT,
    placeholder: LOCAL_MINIO_ENDPOINT,
    validate: (value) =>
      value.trim() === "" || isHttpUrl(value.trim())
        ? undefined
        : `S3 endpoint: ${HTTP_URL_ERROR}`,
  });
  return endpoint.trim() || LOCAL_MINIO_ENDPOINT;
}

async function askS3(context: Context): Promise<StorageAnswer> {
  const { args, prompter } = context;
  const endpoint = await askEndpoint(context);
  const localMinio = endpoint === LOCAL_MINIO_ENDPOINT;
  let accessKeyId = args.s3AccessKeyId;
  let secretAccessKey = args.s3SecretAccessKey;
  if (localMinio) {
    accessKeyId ??= LOCAL_MINIO_KEY;
    secretAccessKey ??= LOCAL_MINIO_KEY;
  }
  accessKeyId ??= await prompter.text({
    message: "S3 access key id",
    defaultValue: "",
    validate: (value) => orUndefined(envValueError("S3 access key id", value)),
  });
  secretAccessKey ??= await prompter.password({
    message: "S3 secret access key",
    validate: (value) =>
      orUndefined(envValueError("S3 secret access key", value)),
  });
  return { provider: "s3", endpoint, accessKeyId, secretAccessKey, localMinio };
}

async function askStorage(
  context: Context,
  modules: string[],
): Promise<StorageAnswer | null> {
  if (!modules.includes(UPLOADS)) {
    return null;
  }
  const { args, prompter, ask } = context;
  let provider = args.storage;
  if (provider === null) {
    provider = ask
      ? await prompter.select<StorageProvider>({
          message: "File storage for uploads",
          options: [
            {
              value: "local",
              label: "local",
              hint: "files on the server's disk",
            },
            {
              value: "s3",
              label: "s3",
              hint: "S3-compatible storage: local MinIO, AWS, R2, …",
            },
          ],
          initialValue: "local",
        })
      : "local";
  }
  return provider === "s3" ? askS3(context) : { provider: "local" };
}

function optionalEnvValue(label: string, value: string): string | undefined {
  return value.trim() === ""
    ? undefined
    : orUndefined(envValueError(label, value.trim()));
}

async function askMailProvider({
  args,
  prompter,
  ask,
}: Context): Promise<MailProvider> {
  if (args.mailProvider !== null) {
    return args.mailProvider;
  }
  if (!ask) {
    return "smtp";
  }
  return prompter.select<MailProvider>({
    message: "How should the app send mail?",
    options: [
      {
        value: "smtp",
        label: "smtp",
        hint: "local mailpit in development, or your own relay",
      },
      { value: "resend", label: "resend", hint: "Resend API key" },
      {
        value: "console",
        label: "console",
        hint: "send nothing, log emails to the console",
      },
    ],
    initialValue: "smtp",
  });
}

async function askSmtpHost({ args, prompter, ask }: Context): Promise<string> {
  if (args.smtpHost !== null) {
    return args.smtpHost;
  }
  if (!ask) {
    return LOCAL_MAILPIT_HOST;
  }
  const host = await prompter.text({
    message: `SMTP host (${LOCAL_MAILPIT_HOST} = local mailpit started with Docker)`,
    defaultValue: LOCAL_MAILPIT_HOST,
    placeholder: LOCAL_MAILPIT_HOST,
    validate: (value) => optionalEnvValue("SMTP host", value),
  });
  return host.trim() || LOCAL_MAILPIT_HOST;
}

async function askSmtpPort({ args, prompter, ask }: Context): Promise<number> {
  if (args.smtpPort !== null) {
    return args.smtpPort;
  }
  if (!ask) {
    return DEFAULT_SMTP_PORT;
  }
  const port = await prompter.text({
    message: "SMTP port",
    defaultValue: String(DEFAULT_SMTP_PORT),
    placeholder: String(DEFAULT_SMTP_PORT),
    validate: (value) =>
      value.trim() === "" || parsePort(value.trim()) !== null
        ? undefined
        : `SMTP port: ${PORT_ERROR}`,
  });
  return parsePort(port.trim()) ?? DEFAULT_SMTP_PORT;
}

async function askSmtpUser({
  args,
  prompter,
  ask,
}: Context): Promise<string | null> {
  if (args.smtpUser !== null) {
    return args.smtpUser;
  }
  if (!ask) {
    return null;
  }
  const user = (
    await prompter.text({
      message: "SMTP user (empty = no authentication)",
      defaultValue: "",
      validate: (value) => optionalEnvValue("SMTP user", value),
    })
  ).trim();
  return user === "" ? null : user;
}

async function askSmtp(context: Context): Promise<MailAnswer> {
  const host = await askSmtpHost(context);
  if (host === LOCAL_MAILPIT_HOST) {
    return { provider: "smtp", localMailpit: true };
  }
  const port = await askSmtpPort(context);
  const user = await askSmtpUser(context);
  const pass =
    user === null
      ? null
      : (context.args.smtpPass ??
        (await context.prompter.password({
          message: "SMTP password",
          validate: (value) =>
            orUndefined(envValueError("SMTP password", value)),
        })));
  return { provider: "smtp", localMailpit: false, host, port, user, pass };
}

async function askMail(context: Context): Promise<MailAnswer> {
  const provider = await askMailProvider(context);
  if (provider === "console") {
    return { provider: "console" };
  }
  if (provider === "smtp") {
    return askSmtp(context);
  }
  const apiKey =
    context.args.resendApiKey ??
    (await context.prompter.password({
      message: "Resend API key",
      validate: (value) => orUndefined(envValueError("Resend API key", value)),
    }));
  return { provider: "resend", apiKey };
}

async function askSetup({ args, prompter, ask }: Context): Promise<boolean> {
  if (!args.install || !args.docker) {
    return false;
  }
  if (args.setup || !ask) {
    return true;
  }
  return prompter.confirm({
    message:
      "Start the database with Docker, run migrations and create the admin now?",
    initialValue: true,
  });
}

export async function collectAnswers(input: {
  args: CreateCliArgs;
  slug: string;
  modules: KitModule[];
  prompter: Prompter;
}): Promise<Answers> {
  const context: Context = {
    args: input.args,
    prompter: input.prompter,
    ask: !input.args.yes,
  };
  const modules = await askModules(context, input.modules);
  const locales = await askLocales(context);
  const title = await askTitle(context, input.slug);
  const adminEmail = await askAdminEmail(context);
  const storage = await askStorage(context, modules);
  const mail = await askMail(context);
  const setup = await askSetup(context);
  return { modules, locales, title, adminEmail, storage, mail, setup };
}
