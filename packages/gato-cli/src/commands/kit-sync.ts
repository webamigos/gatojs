import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readKitConfig, readKitManifests } from "../kit/kit-config.js";
import { writeKitState } from "../manifest/kit-state.js";
import { kitStateSchema } from "../manifest/schema.js";
import type { KitState } from "../manifest/schema.js";

async function readExisting(kitDir: string): Promise<string | null> {
  try {
    return await readFile(join(kitDir, ".wa/kit.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function readExistingOwnState(
  raw: string | null,
): Pick<KitState, "projectModules" | "ejected"> {
  if (raw === null) {
    return { projectModules: {}, ejected: {} };
  }
  const { projectModules, ejected } = kitStateSchema.parse(JSON.parse(raw));
  return { projectModules, ejected };
}

export async function kitSync(kitDir: string): Promise<{ changed: boolean }> {
  const config = await readKitConfig(kitDir);
  const manifests = await readKitManifests(kitDir);
  const before = await readExisting(kitDir);
  const { projectModules, ejected } = readExistingOwnState(before);
  const state: KitState = {
    kitVersion: config.version,
    kitRepo: config.repo,
    kitFormat: config.kitFormat,
    project: {
      name: config.placeholders.projectName,
      slug: config.placeholders.projectSlug,
    },
    locales: ["pl", "en"],
    modules: Object.fromEntries(
      manifests.map((manifest) => [
        manifest.name,
        { version: manifest.version, manifest, files: {} },
      ]),
    ),
    projectModules,
    ejected,
  };
  await writeKitState(kitDir, state);
  return { changed: before !== (await readExisting(kitDir)) };
}
