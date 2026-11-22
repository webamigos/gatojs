export type CliArgs =
  | { kind: "help" }
  | { kind: "version" }
  | {
      kind: "create";
      target: string;
      kitVersion: string | null;
      kitPath: string | null;
      install: boolean;
      passthrough: string[];
    };

export const USAGE = [
  "Usage: create-gato-app <dir> [options]",
  "",
  "Creates a GatoJS project: downloads the kit and runs `gato create` from gato-cli.",
  "",
  "Options of create-gato-app:",
  "  --kit-version <x.y.z>  kit version (tag v<x.y.z>); default: the highest v<x.y.z> tag",
  "  --kit <path>           use a local kit checkout instead of downloading one",
  "  --skip-install         write files only (passes --no-install); Node check only warns",
  "  -h, --help             print this help",
  "  -v, --version          print the create-gato-app version",
  "",
  "Other options go to `gato create`: --modules a,b  --locales pl,en  --title <text>",
  "  --admin-email <email>  --yes  --setup  --no-install  --no-git",
  "  --cli-source <tarball>  (the project's gato-cli from a packed tarball, for CI)",
  "",
  "Private repository: set GITHUB_TOKEN or GH_TOKEN, or log in with `gh auth login`.",
].join("\n");

const KIT_VERSION_PATTERN =
  /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
const GATO_CREATE_VALUE_OPTIONS = new Set([
  "--modules",
  "--locales",
  "--title",
  "--admin-email",
  "--cli-source",
]);
const UNSUPPORTED_FLAGS = new Set(["--skip-docker"]);
const NO_INSTALL = "--no-install";

type OwnValueFlag = "--kit-version" | "--kit";

const MISSING_VALUE_MESSAGES: Record<OwnValueFlag, string> = {
  "--kit-version": "--kit-version needs a value, e.g. --kit-version 0.1.0",
  "--kit": "--kit needs a path",
};

function ownValueFlagOf(arg: string): OwnValueFlag | null {
  for (const flag of ["--kit-version", "--kit"] as const) {
    if (arg === flag || arg.startsWith(`${flag}=`)) {
      return flag;
    }
  }
  return null;
}

function parseKitVersion(value: string): string {
  const match = KIT_VERSION_PATTERN.exec(value);
  if (!match) {
    throw new Error(`--kit-version: expected x.y.z, got "${value}"`);
  }
  return match[1] as string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    return { kind: "version" };
  }

  const values = new Map<OwnValueFlag, string>();
  const passthrough: string[] = [];
  const positionals: string[] = [];
  let install = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    const ownFlag = ownValueFlagOf(arg);
    if (ownFlag !== null) {
      let value: string | undefined;
      if (arg.includes("=")) {
        value = arg.slice(arg.indexOf("=") + 1);
      } else {
        value = argv[index + 1];
        if (value !== undefined && !value.startsWith("-")) {
          index += 1;
        } else {
          value = undefined;
        }
      }
      if (value === undefined || value === "") {
        throw new Error(MISSING_VALUE_MESSAGES[ownFlag]);
      }
      if (values.has(ownFlag)) {
        throw new Error(`${ownFlag} given more than once`);
      }
      values.set(ownFlag, value);
      continue;
    }
    if (UNSUPPORTED_FLAGS.has(arg)) {
      throw new Error(`${arg} is not supported yet`);
    }
    if (arg === "--skip-install" || arg === NO_INSTALL) {
      if (install) {
        passthrough.push(NO_INSTALL);
      }
      install = false;
      continue;
    }
    passthrough.push(arg);
    if (GATO_CREATE_VALUE_OPTIONS.has(arg)) {
      const value = argv[index + 1];
      if (value !== undefined) {
        passthrough.push(value);
        index += 1;
      }
    } else if (!arg.startsWith("-")) {
      positionals.push(arg);
    }
  }

  const kitVersionValue = values.get("--kit-version");
  const kitPath = values.get("--kit") ?? null;
  if (kitVersionValue !== undefined && kitPath !== null) {
    throw new Error("--kit and --kit-version cannot be used together");
  }
  const kitVersion =
    kitVersionValue === undefined ? null : parseKitVersion(kitVersionValue);

  const [target] = positionals;
  if (target === undefined) {
    throw new Error(`Missing project directory.\n${USAGE}`);
  }
  return { kind: "create", target, kitVersion, kitPath, install, passthrough };
}
