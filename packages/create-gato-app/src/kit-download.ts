import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchKitTarball, type FetchLike } from "./github.js";

export type SpawnResult = { code: number; stdout: string; stderr: string };

export type Spawn = (
  command: string,
  args: string[],
  options: { cwd?: string; stdio: "inherit" | "pipe" },
) => Promise<SpawnResult>;

const GIT_REQUIRED =
  "create-gato-app needs git to read the kit files (`wa create` lists them with git ls-files)";

async function runGit(
  spawn: Spawn,
  args: string[],
  cwd: string,
): Promise<void> {
  let result: SpawnResult;
  try {
    result = await spawn("git", args, { cwd, stdio: "pipe" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${GIT_REQUIRED}: ${detail}`, { cause: error });
  }
  if (result.code !== 0) {
    throw new Error(
      `${GIT_REQUIRED}: git ${args.join(" ")} failed: ${result.stderr.trim()}`,
    );
  }
}

export async function downloadKit(input: {
  version: string;
  token: string | null;
  fetch: FetchLike;
  spawn: Spawn;
  workDir: string;
}): Promise<string> {
  const bytes = await fetchKitTarball(input);
  const tarballPath = join(input.workDir, "kit.tar.gz");
  const kitDir = join(input.workDir, "kit");
  await writeFile(tarballPath, bytes);
  await mkdir(kitDir);
  const extracted = await input.spawn(
    "tar",
    ["-xzf", tarballPath, "-C", kitDir, "--strip-components=1"],
    { stdio: "pipe" },
  );
  if (extracted.code !== 0) {
    throw new Error(
      `Could not extract the kit tarball: ${extracted.stderr.trim()}`,
    );
  }
  // WHY: a tarball has no .git, and `wa create` lists kit files with git ls-files; the tarball holds exactly
  // the tracked files, so -f also keeps files that the kit's .gitignore matches but git tracks.
  await runGit(input.spawn, ["init", "-q"], kitDir);
  await runGit(input.spawn, ["add", "-A", "-f"], kitDir);
  return kitDir;
}
