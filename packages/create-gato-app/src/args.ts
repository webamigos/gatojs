import { parseArgs } from "node:util";
import { isHttpUrl, LOCAL_MINIO_ENDPOINT } from "./questions.js";
import {
  adminEmailError,
  envValueError,
  parsePort,
  PORT_ERROR,
  titleError,
} from "./validate.js";

export type Locale = "pl" | "en";

export type StorageProvider = "local" | "s3";

export type MailProvider = "smtp" | "resend" | "console";

export type CreateCliArgs = {
  kind: "create";
  target: string;
  kitVersion: string | null;
  kitPath: string | null;
  modules: string[] | null;
  locales: Locale[] | null;
  title: string | null;
  adminEmail: string | null;
  yes: boolean;
  setup: boolean;
  install: boolean;
  docker: boolean;
  git: boolean;
  cliSource: string | null;
  storage: StorageProvider | null;
  s3Endpoint: string | null;
  s3AccessKeyId: string | null;
  s3SecretAccessKey: string | null;
  mailProvider: MailProvider | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  resendApiKey: string | null;
};

export type CliArgs = { kind: "help" } | { kind: "version" } | CreateCliArgs;

export const USAGE = [
  "Usage: create-gato-app <dir> [options]",
  "",
  "Creates a GatoJS project: checks Node, downloads the kit, asks a few questions, assembles the project",
  "with gato-cli, writes .env (secrets, COMPOSE_PROJECT_NAME), starts Docker, installs, migrates and commits.",
  "",
  "Answers (asked when missing, defaults with --yes):",
  '  --modules <a,b>              kit modules besides the core ("" = core only)',
  "  --locales <pl|pl,en>         app locales (pl is required)",
  "  --title <text>               display name",
  "  --admin-email <email>        first admin's email",
  "  --storage <local|s3>         file storage when the uploads module is chosen",
  "  --s3-endpoint <url>          S3 endpoint (default http://localhost:9000, local MinIO)",
  "  --s3-access-key-id <id>      S3 access key id",
  "  --s3-secret-access-key <key> S3 secret access key",
  "  --mail-provider <smtp|resend|console>",
  "                               how the app sends mail (default smtp: local mailpit)",
  "  --smtp-host <host>           SMTP relay host (default 127.0.0.1, local mailpit)",
  "  --smtp-port <port>           SMTP relay port (default 587)",
  "  --smtp-user <user>           SMTP user (none = no authentication)",
  "  --smtp-pass <pass>           SMTP password",
  "  --resend-api-key <key>       Resend API key",
  "",
  "Steps:",
  "  --yes                        accept defaults, ask nothing",
  "  --setup                      start Docker, migrate and create the admin without asking",
  "  --skip-docker                do not start Docker (no migrate, no admin:create)",
  "  --skip-install               write files only: no npm install, Docker or first commit;",
  "                               an unsupported Node only warns (alias --no-install)",
  "  --no-git                     no git init and no first commit",
  "",
  "Kit source:",
  "  --kit-version <x.y.z>        kit version (tag v<x.y.z>); default: the highest v<x.y.z> tag",
  "  --kit <path>                 use a local kit checkout instead of downloading one",
  "  --cli-source <tarball>       the project's gato-cli from a packed tarball (CI)",
  "",
  "  -h, --help                   print this help",
  "  -v, --version                print the create-gato-app version",
  "",
  "Rate limits: set GITHUB_TOKEN or GH_TOKEN, or log in with `gh auth login`.",
].join("\n");

const KIT_VERSION_PATTERN =
  /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
const LOCALES_ERROR = "--locales: use pl or pl,en (pl is required)";
const ALLOWED_LOCALES = ["pl", "en"];
const MISSING_VALUE_MESSAGES: Record<string, string> = {
  "--kit-version": "--kit-version needs a value, e.g. --kit-version 0.1.0",
  "--kit": "--kit needs a path",
};
const SINGLE_USE_OPTIONS = ["kit-version", "kit"];
const S3_FLAGS = [
  "s3-endpoint",
  "s3-access-key-id",
  "s3-secret-access-key",
] as const;
const SMTP_FLAGS = [
  "smtp-host",
  "smtp-port",
  "smtp-user",
  "smtp-pass",
] as const;
const MAIL_PROVIDERS: readonly string[] = ["smtp", "resend", "console"];

const OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  modules: { type: "string" },
  locales: { type: "string" },
  title: { type: "string" },
  "admin-email": { type: "string" },
  storage: { type: "string" },
  "s3-endpoint": { type: "string" },
  "s3-access-key-id": { type: "string" },
  "s3-secret-access-key": { type: "string" },
  "mail-provider": { type: "string" },
  "smtp-host": { type: "string" },
  "smtp-port": { type: "string" },
  "smtp-user": { type: "string" },
  "smtp-pass": { type: "string" },
  "resend-api-key": { type: "string" },
  yes: { type: "boolean" },
  setup: { type: "boolean" },
  "skip-docker": { type: "boolean" },
  "skip-install": { type: "boolean" },
  "no-install": { type: "boolean" },
  "no-git": { type: "boolean" },
  "kit-version": { type: "string" },
  kit: { type: "string" },
  "cli-source": { type: "string" },
} as const;

type Values = ReturnType<typeof parseOptions>["values"];

function optionNameOf(message: string): string {
  const match = /'(-[^' ]+)/.exec(message);
  return match ? (match[1] as string) : message;
}

function missingValue(flag: string): string {
  return MISSING_VALUE_MESSAGES[flag] ?? `${flag} needs a value`;
}

function parseOptions(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
      tokens: true,
    });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error)) {
      throw error;
    }
    const option = optionNameOf(error.message);
    if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      throw new Error(`Unknown option: ${option}`, { cause: error });
    }
    if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
      const takesValue = Object.entries(OPTIONS).some(
        ([name, config]) => `--${name}` === option && config.type === "string",
      );
      throw new Error(
        takesValue ? missingValue(option) : `${option} does not take a value`,
        { cause: error },
      );
    }
    throw error;
  }
}

function listOf(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function parseLocales(value: string): Locale[] {
  const locales = listOf(value);
  const valid =
    locales.includes("pl") &&
    new Set(locales).size === locales.length &&
    locales.every((locale) => ALLOWED_LOCALES.includes(locale));
  if (!valid) {
    throw new Error(LOCALES_ERROR);
  }
  return locales as Locale[];
}

function nonEmpty(value: string | undefined, flag: string): string | null {
  if (value === undefined) {
    return null;
  }
  if (value === "") {
    throw new Error(missingValue(flag));
  }
  return value;
}

function parseKitVersion(value: string | undefined): string | null {
  const text = nonEmpty(value, "--kit-version");
  if (text === null) {
    return null;
  }
  const match = KIT_VERSION_PATTERN.exec(text);
  if (!match) {
    throw new Error(`--kit-version: expected x.y.z, got "${text}"`);
  }
  return match[1] as string;
}

function checked(
  value: string | undefined,
  flag: string,
  error: (value: string) => string | null,
): string | null {
  if (value === undefined) {
    return null;
  }
  const message = error(value);
  if (message !== null) {
    throw new Error(`${flag}: ${message}`);
  }
  return value;
}

function parseTitle(value: string | undefined): string | null {
  return checked(value, "--title", titleError)?.trim() ?? null;
}

function parseStorage(
  values: Values,
): Pick<
  CreateCliArgs,
  "storage" | "s3Endpoint" | "s3AccessKeyId" | "s3SecretAccessKey"
> {
  const storage = values.storage;
  if (storage !== undefined && storage !== "local" && storage !== "s3") {
    throw new Error("--storage: use local or s3");
  }
  for (const flag of S3_FLAGS) {
    if (values[flag] !== undefined && storage !== "s3") {
      throw new Error(`--${flag} needs --storage s3`);
    }
  }
  const endpoint = values["s3-endpoint"];
  if (endpoint !== undefined && !isHttpUrl(endpoint)) {
    throw new Error("--s3-endpoint: expected an http(s) URL");
  }
  return {
    storage: storage ?? null,
    s3Endpoint: endpoint ?? null,
    s3AccessKeyId: checked(
      values["s3-access-key-id"],
      "--s3-access-key-id",
      (value) => envValueError("S3 access key id", value),
    ),
    s3SecretAccessKey: checked(
      values["s3-secret-access-key"],
      "--s3-secret-access-key",
      (value) => envValueError("S3 secret access key", value),
    ),
  };
}

function isMailProvider(value: string): value is MailProvider {
  return MAIL_PROVIDERS.includes(value);
}

function envValue(
  values: Values,
  flag: (typeof SMTP_FLAGS)[number] | "resend-api-key",
  label: string,
): string | null {
  return checked(values[flag], `--${flag}`, (value) =>
    envValueError(label, value),
  );
}

function parseSmtpPort(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const port = parsePort(value);
  if (port === null) {
    throw new Error(`--smtp-port: ${PORT_ERROR}`);
  }
  return port;
}

function parseMail(
  values: Values,
): Pick<
  CreateCliArgs,
  | "mailProvider"
  | "smtpHost"
  | "smtpPort"
  | "smtpUser"
  | "smtpPass"
  | "resendApiKey"
> {
  const provider = values["mail-provider"];
  if (provider !== undefined && !isMailProvider(provider)) {
    throw new Error("--mail-provider: use smtp, resend or console");
  }
  for (const flag of SMTP_FLAGS) {
    if (values[flag] !== undefined && provider !== "smtp") {
      throw new Error(`--${flag} needs --mail-provider smtp`);
    }
  }
  if (values["resend-api-key"] !== undefined && provider !== "resend") {
    throw new Error("--resend-api-key needs --mail-provider resend");
  }
  return {
    mailProvider: provider ?? null,
    smtpHost: envValue(values, "smtp-host", "SMTP host"),
    smtpPort: parseSmtpPort(values["smtp-port"]),
    smtpUser: envValue(values, "smtp-user", "SMTP user"),
    smtpPass: envValue(values, "smtp-pass", "SMTP password"),
    resendApiKey: envValue(values, "resend-api-key", "Resend API key"),
  };
}

function assertMailCredentials(args: CreateCliArgs): void {
  if (!args.yes) {
    return;
  }
  if (args.mailProvider === "resend" && args.resendApiKey === null) {
    throw new Error(
      "--mail-provider resend needs --resend-api-key (or drop --yes to be asked)",
    );
  }
  if (args.smtpUser !== null && args.smtpPass === null) {
    throw new Error(
      "--smtp-user needs --smtp-pass (or drop --yes to be asked)",
    );
  }
}

function assertExternalS3Keys(args: CreateCliArgs): void {
  const external =
    args.s3Endpoint !== null && args.s3Endpoint !== LOCAL_MINIO_ENDPOINT;
  if (
    args.yes &&
    external &&
    (args.s3AccessKeyId === null || args.s3SecretAccessKey === null)
  ) {
    throw new Error(
      "--storage s3 with --s3-endpoint needs --s3-access-key-id and --s3-secret-access-key (or drop --yes to be asked)",
    );
  }
}

export function parseCliArgs(argv: string[]): CliArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    return { kind: "version" };
  }
  const { values, positionals, tokens } = parseOptions(argv);
  for (const name of SINGLE_USE_OPTIONS) {
    const uses = tokens.filter(
      (token) => token.kind === "option" && token.name === name,
    );
    if (uses.length > 1) {
      throw new Error(`--${name} given more than once`);
    }
  }
  const [target, unexpected] = positionals;
  if (target === undefined || target === "") {
    throw new Error(`Missing project directory.\n${USAGE}`);
  }
  if (unexpected !== undefined) {
    throw new Error(`Unexpected argument: ${unexpected}`);
  }
  const kitVersion = parseKitVersion(values["kit-version"]);
  const kitPath = nonEmpty(values.kit, "--kit");
  if (kitVersion !== null && kitPath !== null) {
    throw new Error("--kit and --kit-version cannot be used together");
  }
  const install = !(values["skip-install"] || values["no-install"]);
  const docker = install && !values["skip-docker"];
  const setup = values.setup ?? false;
  if (setup && !docker) {
    throw new Error(
      "--setup needs npm install and Docker; drop --skip-install/--skip-docker",
    );
  }
  const args: CreateCliArgs = {
    kind: "create",
    target,
    kitVersion,
    kitPath,
    modules: values.modules === undefined ? null : listOf(values.modules),
    locales: values.locales === undefined ? null : parseLocales(values.locales),
    title: parseTitle(values.title),
    adminEmail: checked(
      values["admin-email"],
      "--admin-email",
      adminEmailError,
    ),
    yes: values.yes ?? false,
    setup,
    install,
    docker,
    git: !values["no-git"],
    cliSource: nonEmpty(values["cli-source"], "--cli-source"),
    ...parseStorage(values),
    ...parseMail(values),
  };
  assertExternalS3Keys(args);
  assertMailCredentials(args);
  return args;
}
