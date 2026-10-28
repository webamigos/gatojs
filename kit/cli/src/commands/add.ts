import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareCodePoint } from "../compare.js";
import { copyFiles } from "../assemble/copy.js";
import { addDependencies } from "../assemble/package-json.js";
import { moduleFiles, resolveModules } from "../assemble/resolve-modules.js";
import { generate } from "../generate/index.js";
import { assemblableFiles } from "../kit/files.js";
import { readKitConfig, readKitManifests } from "../kit/kit-config.js";
import { resolveKitSource } from "../kit/source.js";
import { readKitState, writeKitState } from "../manifest/kit-state.js";
import type { Runner } from "../process/runner.js";

export type AddOptions = {
  projectDir: string;
  module: string;
  kitDir: string;
  install: boolean;
  runner: Runner;
  log: (line: string) => void;
};

export async function add(options: AddOptions): Promise<{ added: string[] }> {
  const { projectDir, module, kitDir, runner, log } = options;
  const state = await readKitState(projectDir);
  if (module in state.modules) {
    throw new Error(`Moduł ${module} jest już zainstalowany`);
  }
  if (module in state.projectModules) {
    throw new Error(
      `Moduł ${module} jest modułem projektu; zmień jego nazwę albo usuń wpis z projectModules`,
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
  const collisions = [...new Set(filesByModule.flatMap(({ files }) => files))]
    .filter((file) => existsSync(join(projectDir, file)))
    .sort(compareCodePoint);
  if (collisions.length > 0) {
    throw new Error(
      `Pliki już istnieją, przerwano bez zmian:\n${collisions
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
  const packageJsonPath = join(projectDir, "package.json");
  let packageJson = await readFile(packageJsonPath, "utf8");
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
    packageJson = addDependencies(packageJson, manifest);
  }
  await writeFile(packageJsonPath, packageJson);
  await writeKitState(projectDir, { ...state, modules });
  await generate(projectDir);

  if (options.install) {
    try {
      await runner("npm", ["install"], projectDir);
    } catch {
      throw new Error(
        "Moduł dodany, ale npm install się nie powiódł. Uruchom: npm install",
      );
    }
  }
  log(`npx prisma migrate dev --name add-${module}`);
  return { added: toAdd.map((manifest) => manifest.name) };
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
