import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCliArgs, USAGE, type CreateCliArgs } from "./args.js";
import {
  fetchKitPackageJson,
  GitHubTokenRejectedError,
  resolveKitVersion,
  resolveToken,
  type FetchLike,
} from "./github.js";
import { downloadKit, type Spawn } from "./kit-download.js";
import {
  nodeRangesFromPackageJson,
  readKitPackageJson,
} from "./kit-engines.js";
import { checkNodeVersion } from "./node-version.js";
import { assertProjectName } from "./project-name.js";
import { CancelledError, type Prompter } from "./questions.js";
import type { Ui } from "./ui.js";
import { runWizard } from "./wizard.js";

export type CliDeps = {
  nodeVersion: string;
  nodePath: string;
  gatoBin: string;
  env: Record<string, string | undefined>;
  cwd: string;
  packageVersion: string;
  fetch: FetchLike;
  spawn: Spawn;
  ghAuthToken: () => Promise<string | null>;
  makeTempDir: () => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
  interactive: boolean;
  prompter: Prompter;
  ui: Ui;
  isPortBusy: (port: number) => Promise<boolean>;
  randomBytes: (size: number) => Uint8Array;
  log: (line: string) => void;
  error: (line: string) => void;
};

const TOKEN_RETRY_WARNING =
  "GitHub rejected the token (401); retrying without it.";
const NO_TERMINAL =
  "No terminal for questions: pass --yes to accept defaults (and flags such as --modules or --admin-email for the rest).";
const CANCELLED = "Cancelled; nothing was written.";

class StopError extends Error {
  name = "StopError";
}

function checkNode(
  deps: CliDeps,
  args: CreateCliArgs,
  packageJson: unknown,
): void {
  const { ranges, warning } = nodeRangesFromPackageJson(packageJson);
  if (warning !== null) {
    deps.error(warning);
  }
  const verdict = checkNodeVersion({
    version: deps.nodeVersion,
    willInstall: args.install,
    ranges,
  });
  if (verdict.kind === "refuse") {
    throw new StopError(verdict.message);
  }
  if (verdict.kind === "warn") {
    deps.error(verdict.message);
  }
}

async function assertEmptyTarget(projectDir: string): Promise<void> {
  if (existsSync(projectDir) && (await readdir(projectDir)).length > 0) {
    throw new StopError(
      `Directory ${projectDir} exists and is not empty; choose another name or empty it.`,
    );
  }
}

async function downloadAndRun(
  deps: CliDeps,
  args: CreateCliArgs,
  projectDir: string,
  token: string | null,
): Promise<number> {
  const version = await resolveKitVersion({
    requested: args.kitVersion,
    fetch: deps.fetch,
    token,
  });
  checkNode(
    deps,
    args,
    await fetchKitPackageJson({ fetch: deps.fetch, token, version }),
  );
  deps.log(`Downloading GatoJS kit v${version}…`);
  const workDir = await deps.makeTempDir();
  try {
    const kitDir = await downloadKit({
      version,
      token,
      fetch: deps.fetch,
      spawn: deps.spawn,
      workDir,
    });
    return await runWizard(deps, args, kitDir, projectDir);
  } finally {
    await deps.removeDir(workDir);
  }
}

async function createFromDownload(
  deps: CliDeps,
  args: CreateCliArgs,
  projectDir: string,
): Promise<number> {
  const token = await resolveToken({
    env: deps.env,
    ghAuthToken: deps.ghAuthToken,
  });
  try {
    return await downloadAndRun(deps, args, projectDir, token);
  } catch (error) {
    if (!(error instanceof GitHubTokenRejectedError)) {
      throw error;
    }
    // WHY: the kit repository is public, so a stale or wrong token should not block the download.
    deps.error(TOKEN_RETRY_WARNING);
    return await downloadAndRun(deps, args, projectDir, null);
  }
}

async function create(deps: CliDeps, args: CreateCliArgs): Promise<number> {
  assertProjectName(deps.cwd, args.target);
  const projectDir = resolve(deps.cwd, args.target);
  await assertEmptyTarget(projectDir);
  if (!args.yes && !deps.interactive) {
    throw new StopError(NO_TERMINAL);
  }
  if (args.kitPath === null) {
    return createFromDownload(deps, args, projectDir);
  }
  const kitDir = resolve(deps.cwd, args.kitPath);
  checkNode(deps, args, await readKitPackageJson(kitDir));
  return runWizard(deps, args, kitDir, projectDir);
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  try {
    const args = parseCliArgs(argv);
    if (args.kind === "help") {
      deps.log(USAGE);
      return 0;
    }
    if (args.kind === "version") {
      deps.log(deps.packageVersion);
      return 0;
    }
    return await create(deps, args);
  } catch (error) {
    if (error instanceof CancelledError) {
      deps.error(CANCELLED);
      return 1;
    }
    deps.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
