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

export async function findGatoConfigKeyProblems(
  root: string,
): Promise<string[]> {
  const configFile = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(configFile)) {
    return [];
  }
  const config = await importDefault<GatoConfig>(configFile);
  const modules = await Promise.all(
    moduleFiles(root).map(({ file }) => importDefault<ModuleDef>(file)),
  );
  return gatoConfigProblems(modules, config);
}

export async function findModuleKeyMismatches(root: string): Promise<string[]> {
  const modules = await Promise.all(
    moduleFiles(root).map(async ({ directory, file }) => ({
      directory,
      key: (await importDefault<ModuleDef>(file)).key,
    })),
  );
  return modules
    .filter(({ directory, key }) => key !== directory)
    .map(
      ({ directory, key }) =>
        `${FEATURES_DIRECTORY}/${directory}/module.ts: key "${key}" differs from the directory name "${directory}"`,
    );
}
