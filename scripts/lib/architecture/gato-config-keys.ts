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

function moduleFiles(root: string): string[] {
  const features = path.join(root, FEATURES_DIRECTORY);
  if (!fs.existsSync(features)) {
    return [];
  }
  return fs
    .readdirSync(features, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => path.join(features, name, "module.ts"))
    .filter((file) => fs.existsSync(file));
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
    moduleFiles(root).map((file) => importDefault<ModuleDef>(file)),
  );
  return gatoConfigProblems(modules, config);
}
