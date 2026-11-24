import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { compareModuleNames } from "../compare.js";
import { moduleManifestSchema } from "../manifest/schema.js";
import type { ModuleManifest } from "../manifest/schema.js";

export const kitConfigSchema = z.object({
  version: z.string().min(1),
  repo: z.string().min(1),
  kitFormat: z.number().int().positive().default(1),
  kitOnly: z.array(z.string()),
  placeholders: z.object({
    projectName: z.string(),
    projectSlug: z.string(),
    projectSnake: z.string(),
  }),
  placeholderFiles: z.array(z.string()),
  generatedFiles: z.array(z.string()),
  managedFiles: z.array(z.string()),
  seedFiles: z.array(z.string()).default([]),
});

export type KitConfig = z.infer<typeof kitConfigSchema>;

export async function readKitConfig(kitDir: string): Promise<KitConfig> {
  let raw: string;
  try {
    raw = await readFile(join(kitDir, "kit/kit.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No kit/kit.json in ${kitDir} — this is not a GatoJS repository`,
      );
    }
    throw error;
  }
  return kitConfigSchema.parse(JSON.parse(raw));
}

export async function readKitManifests(
  kitDir: string,
): Promise<ModuleManifest[]> {
  const modulesDir = join(kitDir, "kit/modules");
  const entries = (await readdir(modulesDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => ({ fileName, name: basename(fileName, ".json") }))
    .sort((a, b) => compareModuleNames(a.name, b.name));
  const manifests: ModuleManifest[] = [];
  for (const { fileName, name } of entries) {
    const manifest = moduleManifestSchema.parse(
      JSON.parse(await readFile(join(modulesDir, fileName), "utf8")),
    );
    if (manifest.name !== name) {
      throw new Error(
        `kit/modules/${fileName}: name "${manifest.name}" does not match the file name`,
      );
    }
    manifests.push(manifest);
  }
  return manifests;
}
