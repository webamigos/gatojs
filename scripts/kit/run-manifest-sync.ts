import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  syncManifestDependencies,
  type RepoFile,
  type SyncResult,
} from "./manifest-deps";

export type RunWa = (args: string[]) => Promise<void>;

export type RunManifestSyncOptions = {
  repoDir: string;
  base: string;
  check: boolean;
  runWa: RunWa;
};

const MODULES_DIR = "kit/modules";
const WORKSPACE_DIRS = ["packages", "apps"];

function git(repoDir: string, args: string[]): string {
  return execFileSync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function readRepoFile(repoDir: string, path: string): RepoFile {
  return { path, text: readFileSync(join(repoDir, path), "utf8") };
}

function sortedEntries(repoDir: string, dir: string): string[] {
  const absolute = join(repoDir, dir);
  return existsSync(absolute) ? readdirSync(absolute).sort() : [];
}

function manifestFiles(repoDir: string): RepoFile[] {
  return sortedEntries(repoDir, MODULES_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => readRepoFile(repoDir, `${MODULES_DIR}/${entry}`));
}

function workspacePackageFiles(repoDir: string): RepoFile[] {
  return WORKSPACE_DIRS.flatMap((dir) =>
    sortedEntries(repoDir, dir)
      .map((entry) => `${dir}/${entry}/package.json`)
      .filter((path) => existsSync(join(repoDir, path)))
      .map((path) => readRepoFile(repoDir, path)),
  );
}

function baseReader(repoDir: string, base: string) {
  const mergeBase = git(repoDir, ["merge-base", base, "HEAD"]).trim();
  const tracked = new Set(
    git(repoDir, ["ls-tree", "-r", "--name-only", mergeBase])
      .split("\n")
      .filter(Boolean),
  );
  return (path: string): string | null =>
    tracked.has(path) ? git(repoDir, ["show", `${mergeBase}:${path}`]) : null;
}

export async function runManifestSync(
  options: RunManifestSyncOptions,
): Promise<{ changed: boolean; result: SyncResult }> {
  const { repoDir } = options;
  const result = syncManifestDependencies({
    rootPackageJson: readRepoFile(repoDir, "package.json").text,
    manifests: manifestFiles(repoDir),
    workspacePackages: workspacePackageFiles(repoDir),
    readBase: baseReader(repoDir, options.base),
  });
  const changed = result.files.length > 0;
  if (options.check) {
    return { changed, result };
  }
  for (const file of result.files) {
    writeFileSync(join(repoDir, file.path), file.text);
  }
  await options.runWa(["generate"]);
  await options.runWa(["kit", "sync"]);
  return { changed, result };
}
