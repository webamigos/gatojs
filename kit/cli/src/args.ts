import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

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
};

const LOCALES_ERROR = "--locales: dozwolone pl,en; pl jest wymagany";
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

const OPTION_NAME_IN_ERROR = /'(-{1,2}[^\s'=]+)/;

function optionNameFromError(error: Error): string {
  return OPTION_NAME_IN_ERROR.exec(error.message)?.[1] ?? "";
}

function translateParseError(
  error: unknown,
  options: ParseArgsOptionsConfig,
): unknown {
  if (!(error instanceof Error) || !("code" in error)) {
    return error;
  }
  const option = optionNameFromError(error);
  if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    return new Error(`Nieznana opcja: ${option}`);
  }
  if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
    const takesValue = options[option.replace(/^--/, "")]?.type === "string";
    return new Error(
      takesValue
        ? `Opcja ${option} wymaga wartości`
        : `Opcja ${option} nie przyjmuje wartości`,
    );
  }
  return error;
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
    throw new Error(`Nieoczekiwany argument: ${unexpected}`);
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
  });
  const [target] = positionals;
  if (target === undefined) {
    throw new Error("Podaj katalog projektu");
  }
  assertMaxPositionals(positionals, 1);
  if (values.setup && values["no-install"]) {
    throw new Error("--setup wymaga instalacji zależności (bez --no-install)");
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
    kit: values.kit ?? null,
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
    throw new Error("Podaj nazwę modułu");
  }
  assertMaxPositionals(positionals, 1);
  return {
    module,
    kit: values.kit ?? null,
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
    throw new Error("Podaj nazwę modułu");
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
  return { kit: values.kit ?? null };
}
