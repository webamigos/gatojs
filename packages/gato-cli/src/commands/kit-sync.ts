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

async function readExistingProjectModules(
  raw: string | null,
): Promise<KitState["projectModules"]> {
  return raw === null
    ? {}
    : kitStateSchema.parse(JSON.parse(raw)).projectModules;
}

export async function kitSync(kitDir: string): Promise<{ changed: boolean }> {
  const config = await readKitConfig(kitDir);
  const manifests = await readKitManifests(kitDir);
  const before = await readExisting(kitDir);
  const state: KitState = {
    kitVersion: config.version,
    kitRepo: config.repo,
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
    projectModules: await readExistingProjectModules(before),
  };
  await writeKitState(kitDir, state);
  return { changed: before !== (await readExisting(kitDir)) };
}
