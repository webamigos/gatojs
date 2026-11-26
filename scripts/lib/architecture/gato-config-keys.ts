import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ModuleDef } from "../../../src/shared/lib/modules/define-module";
import {
  gatoConfigProblems,
  type GatoConfig,
} from "../../../src/shared/lib/modules/gato-config";

const CONFIG_FILE = "src/gato.config.ts";
const FEATURES_DIRECTORY = "src/features";

async function importDefault<T>(file: string): Promise<T> {
  const imported = (await import(pathToFileURL(file).href)) as {
    default: T;
  };
  return imported.default;
}

type ModuleFile = { directory: string; file: string };

function moduleFiles(root: string): ModuleFile[] {
  const features = path.join(root, FEATURES_DIRECTORY);
  if (!fs.existsSync(features)) {
    return [];
  }
  return fs
    .readdirSync(features, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((directory) => ({
      directory,
      file: path.join(features, directory, "module.ts"),
    }))
    .filter(({ file }) => fs.existsSync(file));
}

type LoadedModule = { directory: string; moduleDef: ModuleDef };

function loadModules(root: string): Promise<LoadedModule[]> {
  return Promise.all(
    moduleFiles(root).map(async ({ directory, file }) => ({
      directory,
      moduleDef: await importDefault<ModuleDef>(file),
    })),
  );
}

export async function loadFeatureModules(root: string): Promise<ModuleDef[]> {
  const loaded = await loadModules(root);
  return loaded.map(({ moduleDef }) => moduleDef);
}

export async function findGatoConfigKeyProblems(
  root: string,
): Promise<string[]> {
  const configFile = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(configFile)) {
    return [];
  }
  const config = await importDefault<GatoConfig>(configFile);
  return gatoConfigProblems(await loadFeatureModules(root), config);
}

export async function findModuleKeyMismatches(root: string): Promise<string[]> {
  const modules = await loadModules(root);
  return modules
    .filter(({ directory, moduleDef }) => moduleDef.key !== directory)
    .map(
      ({ directory, moduleDef: { key } }) =>
        `${FEATURES_DIRECTORY}/${directory}/module.ts: key "${key}" differs from the directory name "${directory}"`,
    );
}
