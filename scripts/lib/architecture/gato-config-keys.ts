import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ModuleDef } from "../../../src/shared/lib/modules/define-module";
import {
  gatoConfigProblems,
  type GatoConfig,
  type ModuleEntry,
} from "../../../src/shared/lib/modules/gato-config";
import {
  slotConfigProblems,
  type ClientSlotModule,
  type SlotModule,
  type SlotRegistryInput,
} from "../../../src/shared/lib/modules/slots";

const CONFIG_FILE = "src/gato.config.ts";
const FEATURES_DIRECTORY = "src/features";

async function importDefault<T>(file: string): Promise<T> {
  const imported = (await import(pathToFileURL(file).href)) as {
    default: T;
  };
  return imported.default;
}

async function importModule<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(file).href)) as T;
}

type ModuleFile = { directory: string; file: string };

function featureDirectories(root: string): string[] {
  const features = path.join(root, FEATURES_DIRECTORY);
  if (!fs.existsSync(features)) {
    return [];
  }
  return fs
    .readdirSync(features, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function featureFiles(root: string, fileName: string): ModuleFile[] {
  return featureDirectories(root)
    .map((directory) => ({
      directory,
      file: path.join(root, FEATURES_DIRECTORY, directory, fileName),
    }))
    .filter(({ file }) => fs.existsSync(file));
}

function moduleFiles(root: string): ModuleFile[] {
  return featureFiles(root, "module.ts");
}

function loadEntries<T>(
  root: string,
  fileName: string,
): Promise<ModuleEntry<T>[]> {
  return Promise.all(
    featureFiles(root, fileName).map(async ({ directory, file }) => ({
      module: directory,
      value: await importModule<T>(file),
    })),
  );
}

async function loadSlotInput(root: string): Promise<SlotRegistryInput> {
  return {
    slots: await loadEntries<SlotModule>(root, "slots.ts"),
    clientSlots: await loadEntries<ClientSlotModule>(root, "client-slots.ts"),
  };
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
  return [
    ...gatoConfigProblems(await loadFeatureModules(root), config),
    ...slotConfigProblems(await loadSlotInput(root), config),
  ];
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
