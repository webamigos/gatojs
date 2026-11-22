import { resolve } from "node:path";
import { parseCliArgs, USAGE } from "./args.js";
import { waCreateCommand } from "./delegate.js";
import { resolveKitVersion, resolveToken, type FetchLike } from "./github.js";
import { downloadKit, type Spawn } from "./kit-download.js";
import { checkNodeVersion } from "./node-version.js";

export type CliDeps = {
  nodeVersion: string;
  nodePath: string;
  env: Record<string, string | undefined>;
  cwd: string;
  packageVersion: string;
  fetch: FetchLike;
  spawn: Spawn;
  ghAuthToken: () => Promise<string | null>;
  makeTempDir: () => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
  log: (line: string) => void;
  error: (line: string) => void;
};

async function delegate(
  deps: CliDeps,
  kitDir: string,
  passthrough: string[],
): Promise<number> {
  const { command, args } = waCreateCommand({
    nodePath: deps.nodePath,
    kitDir,
    passthrough,
  });
  const result = await deps.spawn(command, args, {
    cwd: deps.cwd,
    stdio: "inherit",
  });
  return result.code;
}

async function createFromDownload(
  deps: CliDeps,
  requested: string | null,
  passthrough: string[],
): Promise<number> {
  const token = await resolveToken({
    env: deps.env,
    ghAuthToken: deps.ghAuthToken,
  });
  const version = await resolveKitVersion({
    requested,
    fetch: deps.fetch,
    token,
  });
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
    return await delegate(deps, kitDir, passthrough);
  } finally {
    await deps.removeDir(workDir);
  }
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
    const verdict = checkNodeVersion({
      version: deps.nodeVersion,
      willInstall: args.install,
    });
    if (verdict.kind === "refuse") {
      deps.error(verdict.message);
      return 1;
    }
    if (verdict.kind === "warn") {
      deps.error(verdict.message);
    }
    if (args.kitPath !== null) {
      return await delegate(
        deps,
        resolve(deps.cwd, args.kitPath),
        args.passthrough,
      );
    }
    return await createFromDownload(deps, args.kitVersion, args.passthrough);
  } catch (error) {
    deps.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
