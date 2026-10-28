import { compareCodePoint } from "../compare.js";
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
  return kitStateSchema.parse(JSON.parse(raw));
}

export async function writeKitState(
  projectDir: string,
  state: KitState,
): Promise<void> {
  const sortedModules = Object.fromEntries(
    Object.entries(state.modules).sort(([a], [b]) => compareCodePoint(a, b)),
  );
  const target = join(projectDir, KIT_STATE_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify({ ...state, modules: sortedModules }, null, 2)}\n`,
  );
}

export function installedModules(state: KitState): ModuleManifest[] {
  return Object.entries(state.modules)
    .sort(([a], [b]) => {
      if (a === "core") return -1;
      if (b === "core") return 1;
      return compareCodePoint(a, b);
    })
    .map(([, entry]) => entry.manifest);
}
