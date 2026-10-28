import { readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { compareCodePoint } from "../compare.js";
import { fileHash } from "../assemble/hash.js";
import { removeDependencies } from "../assemble/package-json.js";
import { generate } from "../generate/index.js";
import type { KitConfig } from "../kit/kit-config.js";
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

const HASH_CONFIG: KitConfig = {
  version: "",
  repo: "",
  kitOnly: [],
  placeholders: { projectName: "", projectSlug: "", projectSnake: "" },
  placeholderFiles: [],
  generatedFiles: [],
  managedFiles: ["package.json", "package-lock.json"],
};

function assertRemovable(state: KitState, module: string): void {
  if (module === "core") throw new Error("Nie można usunąć rdzenia");
  if (module in state.projectModules) {
    throw new Error(
      `Moduł ${module} należy do projektu; wa remove usuwa tylko moduły kitu. Usuń jego pliki i wpis w projectModules ręcznie`,
    );
  }
  if (!(module in state.modules)) {
    throw new Error(`Moduł ${module} nie jest zainstalowany`);
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
      `Moduł ${module} jest wymagany przez: ${requiredBy.join(", ")}`,
    );
  }
}

function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

function insideProject(projectDir: string, file: string): string {
  const absolute = resolve(projectDir, file);
  if (!isInside(resolve(projectDir), absolute)) {
    throw new Error(`Ścieżka poza projektem: ${file}`);
  }
  return absolute;
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function changedFiles(
  projectDir: string,
  files: Record<string, string>,
): Promise<string[]> {
  const changed: string[] = [];
  for (const [file, savedHash] of Object.entries(files)) {
    const content = await readIfExists(insideProject(projectDir, file));
    if (content === null) continue;
    if (fileHash(file, content, HASH_CONFIG) !== savedHash) changed.push(file);
  }
  return changed.sort(compareCodePoint);
}

async function removeEmptyParents(
  projectDir: string,
  start: string,
): Promise<void> {
  const root = resolve(projectDir);
  let current = dirname(start);
  while (isInside(root, current)) {
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      entries = [];
    }
    if (entries.length > 0) return;
    await rmdir(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    current = dirname(current);
  }
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
  const absolutePaths = Object.keys(entry.files).map((file) =>
    insideProject(projectDir, file),
  );
  const changed = await changedFiles(projectDir, entry.files);
  if (changed.length > 0 && !options.force) {
    throw new Error(
      `Zmienione pliki modułu ${module} (użyj --force):\n${changed
        .map((file) => `  ${file}`)
        .join("\n")}`,
    );
  }

  for (const path of absolutePaths) {
    await rm(path, { force: true });
    await removeEmptyParents(projectDir, path);
  }

  const modules = { ...state.modules };
  delete modules[module];
  const remaining = [
    ...Object.values(modules).map((remainingEntry) => remainingEntry.manifest),
    ...projectModuleManifests(state),
  ];
  const packageJsonPath = join(projectDir, "package.json");
  await writeFile(
    packageJsonPath,
    removeDependencies(
      await readFile(packageJsonPath, "utf8"),
      entry.manifest,
      remaining,
    ),
  );
  await writeKitState(projectDir, { ...state, modules });
  await generate(projectDir);

  if (options.install) {
    try {
      await runner("npm", ["install"], projectDir);
    } catch {
      throw new Error(
        "Moduł usunięty, ale npm install się nie powiódł. Uruchom: npm install",
      );
    }
  }
  log(`npx prisma migrate dev --name remove-${module}`);
  return { removed: [module] };
}
