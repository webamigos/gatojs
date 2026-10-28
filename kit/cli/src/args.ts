import { parseArgs } from "node:util";

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
  if (!valid) throw new Error(LOCALES_ERROR);
  return locales as Locale[];
}

export function parseCreateArgs(argv: string[]): CreateArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      modules: { type: "string" },
      locales: { type: "string" },
      title: { type: "string" },
      "admin-email": { type: "string" },
      setup: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "no-install": { type: "boolean", default: false },
      "no-git": { type: "boolean", default: false },
      kit: { type: "string" },
    },
  });
  const [target] = positionals;
  if (target === undefined) throw new Error("Podaj katalog projektu");
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
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      kit: { type: "string" },
      "no-install": { type: "boolean", default: false },
    },
  });
  const [module] = positionals;
  if (module === undefined) throw new Error("Podaj nazwę modułu");
  return {
    module,
    kit: values.kit ?? null,
    install: !values["no-install"],
  };
}

export type RemoveArgs = { module: string; force: boolean; install: boolean };

export function parseRemoveArgs(argv: string[]): RemoveArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      force: { type: "boolean", default: false },
      "no-install": { type: "boolean", default: false },
    },
  });
  const [module] = positionals;
  if (module === undefined) throw new Error("Podaj nazwę modułu");
  return { module, force: values.force, install: !values["no-install"] };
}

export type ListArgs = { kit: string | null };

export function parseListArgs(argv: string[]): ListArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { kit: { type: "string" } },
  });
  const [unexpected] = positionals;
  if (unexpected !== undefined) {
    throw new Error(`Nieoczekiwany argument: ${unexpected}`);
  }
  return { kit: values.kit ?? null };
}
