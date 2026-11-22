import { resolve } from "node:path";

export type CliName = "gato" | "wa";

export type CliIdentity = { name: CliName; version: string };

export type MetaOutcome = {
  exitCode: number;
  stdout: string | null;
  stderr: string | null;
};

const HELP_ALIASES = ["help", "--help", "-h"];
const VERSION_ALIASES = ["version", "--version", "-v"];
const COMMANDS = ["create", "add", "remove", "list", "update", "generate"];

export function usage(name: CliName): string {
  return [
    `Usage: ${name} <command> [options]`,
    "",
    "Commands:",
    `  ${name} create <dir> [--modules <a,b>] [--locales <pl,en>] [--title <title>] [--admin-email <email>] [--setup] [--yes] [--no-install] [--no-git] [--kit <path>] [--cli-source <tarball>]`,
    `  ${name} add <module> [--kit <path|url>] [--no-install]`,
    `  ${name} remove <module> [--force] [--no-install]`,
    `  ${name} list [--kit <path|url>]`,
    `  ${name} update <version> [--kit <path|url>] [--dry-run] [--no-install]`,
    `  ${name} generate`,
    `  ${name} kit sync`,
    `  ${name} help`,
    `  ${name} version`,
    "",
    "add, list and update read the kit from --kit, then GATO_KIT_SOURCE (or WA_KIT_SOURCE),",
    "then the kitRepo from .wa/kit.json at tag v<kitVersion>.",
  ].join("\n");
}

function isKnownCommand(argv: string[]): boolean {
  const [command, subcommand] = argv;
  if (command === "kit") {
    return subcommand === "sync";
  }
  return COMMANDS.includes(command);
}

function unknownCommandName(argv: string[]): string {
  return argv[0] === "kit" ? argv.slice(0, 2).join(" ") : argv[0];
}

export function runMetaCommand(
  argv: string[],
  identity: CliIdentity,
): MetaOutcome | null {
  const [command] = argv;
  if (command === undefined) {
    return { exitCode: 1, stdout: null, stderr: usage(identity.name) };
  }
  if (HELP_ALIASES.includes(command)) {
    return { exitCode: 0, stdout: usage(identity.name), stderr: null };
  }
  if (VERSION_ALIASES.includes(command)) {
    return { exitCode: 0, stdout: identity.version, stderr: null };
  }
  if (isKnownCommand(argv)) {
    return null;
  }
  return {
    exitCode: 1,
    stdout: null,
    stderr: `Unknown command: ${unknownCommandName(argv)}\n\n${usage(identity.name)}`,
  };
}

export function kitSourceFromEnv(
  env: Record<string, string | undefined>,
): string | undefined {
  return env["GATO_KIT_SOURCE"] || env["WA_KIT_SOURCE"] || undefined;
}

export function createKitDir(input: {
  kitFlag: string | null;
  name: CliName;
  bundleDir: string;
}): string {
  if (input.kitFlag !== null) {
    return resolve(input.kitFlag);
  }
  if (input.name === "gato") {
    throw new Error("gato create needs --kit <path to a GatoJS checkout>");
  }
  return resolve(input.bundleDir, "../..");
}

export function cliDependency(input: {
  name: CliName;
  version: string;
  cliSource: string | null;
  cwd: string;
}): string | null {
  if (input.cliSource !== null) {
    return `file:${resolve(input.cwd, input.cliSource)}`;
  }
  return input.name === "gato" ? `^${input.version}` : null;
}
