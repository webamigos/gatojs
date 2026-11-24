import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { parseVersion } from "./update/version.js";

export type Locale = "pl" | "en";

export type CreateArgs = {
  target: string;
  modules: string[] | null;
  locales: Locale[] | null;
  title: string | null;
  adminEmail: string | null;
  yes: boolean;
  setup: boolean;
  install: boolean;
  git: boolean;
  kit: string | null;
  cliSource: string | null;
};

const LOCALES_ERROR = "--locales: allowed values are pl,en; pl is required";
const ALLOWED_LOCALES: string[] = ["pl", "en"];

export function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function parseLocales(value: string): Locale[] {
  const locales = parseList(value);
  const valid =
    locales.includes("pl") &&
    new Set(locales).size === locales.length &&
    locales.every((locale) => ALLOWED_LOCALES.includes(locale));
  if (!valid) {
    throw new Error(LOCALES_ERROR);
  }
  return locales as Locale[];
}

function translateParseError(
  error: unknown,
  options: ParseArgsOptionsConfig,
): unknown {
  if (!(error instanceof Error) || !("code" in error)) {
    return error;
  }
  const option = error.message.split("'")[1].split(" ")[0];
  if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    return new Error(`Unknown option: ${option}`);
  }
  const takesValue = Object.entries(options).some(
    ([name, config]) => `--${name}` === option && config.type === "string",
  );
  return new Error(
    takesValue
      ? `Option ${option} needs a value`
      : `Option ${option} takes no value`,
  );
}

function optionalValue(
  value: string | undefined,
  option: string,
): string | null {
  if (value === "") {
    throw new Error(`Option ${option} needs a value`);
  }
  return value ?? null;
}

function parseOptions<const T extends ParseArgsOptionsConfig>(
  argv: string[],
  options: T,
) {
  try {
    return parseArgs({ args: argv, allowPositionals: true, options });
  } catch (error) {
    throw translateParseError(error, options);
  }
}

function assertMaxPositionals(positionals: string[], allowed: number): void {
  const unexpected = positionals[allowed];
  if (unexpected !== undefined) {
    throw new Error(`Unexpected argument: ${unexpected}`);
  }
}

export function parseCreateArgs(argv: string[]): CreateArgs {
  const { values, positionals } = parseOptions(argv, {
    modules: { type: "string" },
    locales: { type: "string" },
    title: { type: "string" },
    "admin-email": { type: "string" },
    setup: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    "no-install": { type: "boolean", default: false },
    "no-git": { type: "boolean", default: false },
    kit: { type: "string" },
    "cli-source": { type: "string" },
  });
  const [target] = positionals;
  if (target === undefined) {
    throw new Error("Specify the project directory");
  }
  assertMaxPositionals(positionals, 1);
  if (values.setup && values["no-install"]) {
    throw new Error("--setup needs dependencies installed (drop --no-install)");
  }
  return {
    target,
    modules: values.modules === undefined ? null : parseList(values.modules),
    locales: values.locales === undefined ? null : parseLocales(values.locales),
    title: values.title ?? null,
    adminEmail: values["admin-email"] ?? null,
    yes: values.yes,
    setup: values.setup,
    install: !values["no-install"],
    git: !values["no-git"],
    kit: optionalValue(values.kit, "--kit"),
    cliSource: optionalValue(values["cli-source"], "--cli-source"),
  };
}

export type AddArgs = { module: string; kit: string | null; install: boolean };

export function parseAddArgs(argv: string[]): AddArgs {
  const { values, positionals } = parseOptions(argv, {
    kit: { type: "string" },
    "no-install": { type: "boolean", default: false },
  });
  const [module] = positionals;
  if (module === undefined) {
    throw new Error("Specify the module name");
  }
  assertMaxPositionals(positionals, 1);
  return {
    module,
    kit: optionalValue(values.kit, "--kit"),
    install: !values["no-install"],
  };
}

export type RemoveArgs = { module: string; force: boolean; install: boolean };

export function parseRemoveArgs(argv: string[]): RemoveArgs {
  const { values, positionals } = parseOptions(argv, {
    force: { type: "boolean", default: false },
    "no-install": { type: "boolean", default: false },
  });
  const [module] = positionals;
  if (module === undefined) {
    throw new Error("Specify the module name");
  }
  assertMaxPositionals(positionals, 1);
  return { module, force: values.force, install: !values["no-install"] };
}

export type ListArgs = { kit: string | null };

export function parseListArgs(argv: string[]): ListArgs {
  const { values, positionals } = parseOptions(argv, {
    kit: { type: "string" },
  });
  assertMaxPositionals(positionals, 0);
  return { kit: optionalValue(values.kit, "--kit") };
}

export type UpdateArgs = {
  version: string;
  kit: string | null;
  fromKit: string | null;
  dryRun: boolean;
  install: boolean;
};

export function parseUpdateArgs(argv: string[]): UpdateArgs {
  const { values, positionals } = parseOptions(argv, {
    kit: { type: "string" },
    "from-kit": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "no-install": { type: "boolean", default: false },
  });
  const [version] = positionals;
  if (version === undefined) {
    throw new Error("Specify the kit version");
  }
  assertMaxPositionals(positionals, 1);
  return {
    version: parseVersion(version),
    kit: optionalValue(values.kit, "--kit"),
    fromKit: optionalValue(values["from-kit"], "--from-kit"),
    dryRun: values["dry-run"],
    install: !values["no-install"],
  };
}
