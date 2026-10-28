import { compareCodePoint, compareModuleNames } from "../compare.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { kitStateSchema } from "./schema.js";
import type { KitState, ModuleManifest } from "./schema.js";

const KIT_STATE_PATH = ".wa/kit.json";

export async function readKitState(projectDir: string): Promise<KitState> {
  let raw: string;
  try {
    raw = await readFile(join(projectDir, KIT_STATE_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Brak .wa/kit.json w ${projectDir} — to nie jest projekt wa-kit`,
      );
    }
    throw error;
  }
  const state = kitStateSchema.parse(JSON.parse(raw));
  validateProjectModules(state);
  return state;
}

function validateProjectModules(state: KitState): void {
  for (const [key, { manifest }] of Object.entries(state.projectModules)) {
    if (manifest.name !== key) {
      throw new Error(
        `projectModules.${key}: name "${manifest.name}" nie zgadza się z kluczem`,
      );
    }
    if (key in state.modules) {
      throw new Error(
        `Moduł ${key} jest jednocześnie modułem kitu i modułem projektu`,
      );
    }
    for (const required of manifest.requires) {
      if (!(required in state.modules) && !(required in state.projectModules)) {
        throw new Error(
          `Moduł projektu ${key} wymaga niezainstalowanego modułu: ${required}`,
        );
      }
    }
    if (
      !manifest.files.some((glob) => glob.startsWith(`src/features/${key}/`))
    ) {
      throw new Error(
        `Moduł projektu ${key}: files musi obejmować src/features/${key}/**`,
      );
    }
  }
}

export async function writeKitState(
  projectDir: string,
  state: KitState,
): Promise<void> {
  const sortedModules = Object.fromEntries(
    Object.entries(state.modules).sort(([a], [b]) => compareCodePoint(a, b)),
  );
  const sortedProjectModules = Object.fromEntries(
    Object.entries(state.projectModules).sort(([a], [b]) =>
      compareCodePoint(a, b),
    ),
  );
  const target = join(projectDir, KIT_STATE_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify(
      {
        kitVersion: state.kitVersion,
        kitRepo: state.kitRepo,
        project: state.project,
        locales: state.locales,
        modules: sortedModules,
        projectModules: sortedProjectModules,
      },
      null,
      2,
    )}\n`,
  );
}

export function installedModules(state: KitState): ModuleManifest[] {
  return Object.entries(state.modules)
    .sort(([a], [b]) => compareModuleNames(a, b))
    .map(([, entry]) => entry.manifest);
}

export function projectModuleManifests(state: KitState): ModuleManifest[] {
  return Object.entries(state.projectModules)
    .sort(([a], [b]) => compareCodePoint(a, b))
    .map(([, entry]) => entry.manifest);
}

export function registeredModules(state: KitState): ModuleManifest[] {
  return [...installedModules(state), ...projectModuleManifests(state)];
}
