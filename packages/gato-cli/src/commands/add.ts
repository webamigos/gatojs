import { existsSync } from "node:fs";
import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { compareCodePoint } from "../compare.js";
import { copyFiles } from "../assemble/copy.js";
import {
  addDependencies,
  dependencyConflicts,
} from "../assemble/package-json.js";
import { moduleFiles, resolveModules } from "../assemble/resolve-modules.js";
import { generate } from "../generate/index.js";
import { assemblableFiles } from "../kit/files.js";
import { readKitConfig, readKitManifests } from "../kit/kit-config.js";
import { resolveKitSource } from "../kit/source.js";
import {
  KIT_STATE_PATH,
  readKitState,
  writeKitState,
} from "../manifest/kit-state.js";
import type { Runner } from "../process/runner.js";

export type AddOptions = {
  projectDir: string;
  module: string;
  kitDir: string;
  install: boolean;
  runner: Runner;
  log: (line: string) => void;
};

export function missingDirectories(
  projectDir: string,
  files: string[],
): string[] {
  const missing = new Set<string>();
  for (const file of files) {
    let directory = dirname(file);
    while (!existsSync(join(projectDir, directory))) {
      missing.add(directory);
      directory = dirname(directory);
    }
  }
  return [...missing].sort((a, b) => b.length - a.length);
}

const PACKAGE_JSON = "package.json";
const ABSENT_CODES = new Set<string | undefined>(["ENOENT", "ENOTDIR"]);

function isAbsent(error: unknown): boolean {
  return ABSENT_CODES.has((error as NodeJS.ErrnoException).code);
}

async function pathOccupied(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isAbsent(error)) {
      return false;
    }
    throw error;
  }
}

async function removeModuleFile(path: string): Promise<void> {
  try {
    await rm(path);
  } catch (error) {
    if (!isAbsent(error)) {
      throw error;
    }
  }
}

async function restoreFile(path: string, original: string): Promise<void> {
  const current = await readFile(path, "utf8");
  if (current !== original) {
    await writeFile(path, original);
  }
}

type CleanupStep = { path: string; run: () => Promise<void> };

async function rollbackAdd(input: {
  projectDir: string;
  files: string[];
  createdDirectories: string[];
  originalPackageJson: string;
  originalKitState: string;
  log: (line: string) => void;
}): Promise<void> {
  const { projectDir, log } = input;
  const steps: CleanupStep[] = [
    ...input.files.map((file) => ({
      path: file,
      run: () => removeModuleFile(join(projectDir, file)),
    })),
    ...input.createdDirectories
      .filter((directory) => existsSync(join(projectDir, directory)))
      .map((directory) => ({
        path: directory,
        run: () => rmdir(join(projectDir, directory)),
      })),
    {
      path: PACKAGE_JSON,
      run: () =>
        restoreFile(join(projectDir, PACKAGE_JSON), input.originalPackageJson),
    },
    {
      path: KIT_STATE_PATH,
      run: () =>
        restoreFile(join(projectDir, KIT_STATE_PATH), input.originalKitState),
    },
  ];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      const { code, message } = error as NodeJS.ErrnoException;
      log(`Could not clean up: ${step.path} (${code ?? message})`);
    }
  }
}

export async function add(options: AddOptions): Promise<{ added: string[] }> {
  const { projectDir, module, kitDir, runner, log } = options;
  const state = await readKitState(projectDir);
  if (module in state.modules) {
    throw new Error(`Module ${module} is already installed`);
  }
  if (module in state.projectModules) {
    throw new Error(
      `Module ${module} is a project module; rename it or remove its projectModules entry`,
    );
  }
  const config = await readKitConfig(kitDir);
  const manifests = await readKitManifests(kitDir);
  const toAdd = resolveModules([module], manifests).filter(
    (manifest) => !(manifest.name in state.modules),
  );
  const available = await assemblableFiles(kitDir, config);
  const filesByModule = toAdd.map((manifest) => ({
    manifest,
    files: moduleFiles(manifest, available),
  }));
  const candidates = [...new Set(filesByModule.flatMap(({ files }) => files))];
  const occupied = await Promise.all(
    candidates.map((file) => pathOccupied(join(projectDir, file))),
  );
  const collisions = candidates
    .filter((_, index) => occupied[index])
    .sort(compareCodePoint);
  if (collisions.length > 0) {
    throw new Error(
      `Files already exist; stopped without changes:\n${collisions
        .map((file) => `  ${file}`)
        .join("\n")}`,
    );
  }

  const names = {
    name: state.project.name,
    slug: state.project.slug,
    snake: state.project.slug.replaceAll("-", "_"),
  };
  const modules = { ...state.modules };
  const packageJsonPath = join(projectDir, PACKAGE_JSON);
  const originalPackageJson = await readFile(packageJsonPath, "utf8");
  const originalKitState = await readFile(
    join(projectDir, KIT_STATE_PATH),
    "utf8",
  );
  const plannedFiles = filesByModule.flatMap(({ files }) => files);
  const createdDirectories = missingDirectories(projectDir, plannedFiles);
  try {
    let packageJson = originalPackageJson;
    for (const { manifest, files } of filesByModule) {
      const hashes = await copyFiles({
        kitDir,
        projectDir,
        files,
        config,
        names,
      });
      modules[manifest.name] = {
        version: manifest.version,
        manifest,
        files: hashes,
      };
      for (const conflict of dependencyConflicts(packageJson, manifest)) {
        log(
          `Warning: ${conflict.name} (${conflict.section}) is ${conflict.project} in the project, module ${manifest.name} requires ${conflict.module}; keeping the project version`,
        );
      }
      packageJson = addDependencies(packageJson, manifest);
    }
    await writeFile(packageJsonPath, packageJson);
    await writeKitState(projectDir, { ...state, modules });
  } catch (error) {
    await rollbackAdd({
      projectDir,
      files: plannedFiles,
      createdDirectories,
      originalPackageJson,
      originalKitState,
      log,
    });
    throw error;
  }
  await generate(projectDir);

  if (options.install) {
    try {
      await runner("npm", ["install"], projectDir);
    } catch {
      throw new Error("Module added, but npm install failed. Run: npm install");
    }
  }
  log(`npx prisma migrate dev --name add-${module}`);
  const added = toAdd.map((manifest) => manifest.name);
  for (const name of added) {
    if (existsSync(join(projectDir, "src", "features", name, "setup.ts"))) {
      log(
        `Existing organizations did not run ${name}'s setup: npm run setup:organizations -- --module ${name}`,
      );
    }
  }
  return { added };
}

export async function addFromSource(options: {
  projectDir: string;
  module: string;
  kitFlag: string | null;
  envSource: string | undefined;
  install: boolean;
  runner: Runner;
  log: (line: string) => void;
  tmpRoot: string;
}): Promise<{ added: string[] }> {
  const state = await readKitState(options.projectDir);
  const tmpDir = await mkdtemp(join(options.tmpRoot, "wa-add-"));
  try {
    const kitDir = await resolveKitSource({
      kitFlag: options.kitFlag,
      envSource: options.envSource,
      state,
      runner: options.runner,
      tmpDir,
    });
    return await add({
      projectDir: options.projectDir,
      module: options.module,
      kitDir,
      install: options.install,
      runner: options.runner,
      log: options.log,
    });
  } finally {
    await rm(tmpDir, { recursive: true });
  }
}
