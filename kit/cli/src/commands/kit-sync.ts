import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readKitConfig, readKitManifests } from "../kit/kit-config.js";
import { writeKitState } from "../manifest/kit-state.js";
import type { KitState } from "../manifest/schema.js";

async function readExisting(kitDir: string): Promise<string | null> {
  try {
    return await readFile(join(kitDir, ".wa/kit.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function kitSync(kitDir: string): Promise<{ changed: boolean }> {
  const config = await readKitConfig(kitDir);
  const manifests = await readKitManifests(kitDir);
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
  };
  const before = await readExisting(kitDir);
  await writeKitState(kitDir, state);
  return { changed: before !== (await readExisting(kitDir)) };
}
