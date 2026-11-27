import type { Stats } from "node:fs";
import {
  lstat,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { compareCodePoint } from "../compare.js";
import { fileHash } from "../assemble/hash.js";
import { removeDependencies } from "../assemble/package-json.js";
import { generate } from "../generate/index.js";
import {
  projectModuleManifests,
  readKitState,
  writeKitState,
} from "../manifest/kit-state.js";
import type { KitState } from "../manifest/schema.js";
import type { Runner } from "../process/runner.js";

export type RemoveOptions = {
  projectDir: string;
  module: string;
  force: boolean;
  install: boolean;
  runner: Runner;
  log: (line: string) => void;
};

const HASH_CONFIG = { managedFiles: [], seedFiles: [] };
const SEED = "seed";

function assertRemovable(state: KitState, module: string): void {
  if (module === "core") {
    throw new Error("Cannot remove core");
  }
  if (module in state.projectModules) {
    throw new Error(
      `Module ${module} belongs to the project; remove only handles kit modules. Delete its files and its projectModules entry by hand`,
    );
  }
  if (!(module in state.modules)) {
    throw new Error(`Module ${module} is not installed`);
  }
  const requiredBy = [
    ...Object.values(state.modules).map((entry) => entry.manifest),
    ...projectModuleManifests(state),
  ]
    .filter((manifest) => manifest.requires.includes(module))
    .map((manifest) => manifest.name)
    .sort(compareCodePoint);
  if (requiredBy.length > 0) {
    throw new Error(
      `Module ${module} is required by: ${requiredBy.join(", ")}`,
    );
  }
}

async function readLinkIfSymlink(path: string): Promise<string | null> {
  try {
    return await readlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function realpathOfDeepestAncestor(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      return join(await realpath(current), relative(current, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const linkTarget = await readLinkIfSymlink(current);
      if (linkTarget !== null) {
        return realpathOfDeepestAncestor(
          join(resolve(dirname(current), linkTarget), relative(current, path)),
        );
      }
      current = dirname(current);
    }
  }
}

export async function insideProject(
  projectDir: string,
  file: string,
): Promise<string> {
  const root = await realpath(projectDir);
  const absolute = resolve(projectDir, file);
  const real = await realpathOfDeepestAncestor(absolute);
  if (!real.startsWith(root + sep)) {
    throw new Error(`Path outside the project: ${file}`);
  }
  return absolute;
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function changedFiles(
  projectDir: string,
  files: Record<string, string>,
): Promise<string[]> {
  const changed: string[] = [];
  for (const [file, savedHash] of Object.entries(files)) {
    if (savedHash === SEED) {
      continue;
    }
    const content = await readIfExists(await insideProject(projectDir, file));
    if (content === null) {
      continue;
    }
    if (fileHash(file, content, HASH_CONFIG) !== savedHash) {
      changed.push(file);
    }
  }
  return changed.sort(compareCodePoint);
}

export async function lstatIfExists(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function removeEmptyParents(
  projectDir: string,
  start: string,
): Promise<void> {
  const root = resolve(projectDir);
  let current = dirname(start);
  while (current.startsWith(root + sep)) {
    const stats = await lstatIfExists(current);
    if (stats !== null) {
      if (!stats.isDirectory()) {
        return;
      }
      if ((await readdir(current)).length > 0) {
        return;
      }
      await rmdir(current);
    }
    current = dirname(current);
  }
}

async function keptSeedFiles(
  projectDir: string,
  files: Record<string, string>,
): Promise<string[]> {
  const kept: string[] = [];
  for (const [file, hash] of Object.entries(files)) {
    if (hash !== SEED) {
      continue;
    }
    if ((await lstatIfExists(await insideProject(projectDir, file))) !== null) {
      kept.push(file);
    }
  }
  return kept.sort(compareCodePoint);
}

export async function remove(
  options: RemoveOptions,
): Promise<{ removed: string[] }> {
  const { projectDir, module, runner, log } = options;
  const state = await readKitState(projectDir);
  assertRemovable(state, module);
  const entry = state.modules[module] as NonNullable<
    (typeof state.modules)[string]
  >;
  const absolutePaths = await Promise.all(
    Object.entries(entry.files)
      .filter(([, hash]) => hash !== SEED)
      .map(([file]) => insideProject(projectDir, file)),
  );
  const changed = await changedFiles(projectDir, entry.files);
  if (changed.length > 0 && !options.force) {
    throw new Error(
      `Changed files in module ${module} (use --force):\n${changed
        .map((file) => `  ${file}`)
        .join("\n")}`,
    );
  }

  const modules = { ...state.modules };
  delete modules[module];
  const remaining = [
    ...Object.values(modules).map((remainingEntry) => remainingEntry.manifest),
    ...projectModuleManifests(state),
  ];
  const packageJsonPath = join(projectDir, "package.json");
  const nextPackageJson = removeDependencies(
    await readFile(packageJsonPath, "utf8"),
    entry.manifest,
    remaining,
  );

  for (const path of absolutePaths) {
    await rm(path, { force: true });
    await removeEmptyParents(projectDir, path);
  }

  await writeFile(packageJsonPath, nextPackageJson);
  await writeKitState(projectDir, { ...state, modules });
  await generate(projectDir);

  if (options.install) {
    try {
      await runner("npm", ["install"], projectDir);
    } catch {
      throw new Error(
        "Module removed, but npm install failed. Run: npm install",
      );
    }
  }
  const kept = await keptSeedFiles(projectDir, entry.files);
  if (kept.length > 0) {
    log(`Kept seed files of ${module} (yours, edit or delete them):`);
    for (const file of kept) {
      log(`  ${file}`);
    }
  }
  log(`npx prisma migrate dev --name remove-${module}`);
  return { removed: [module] };
}
