import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { projectPackageJson } from "../assemble/package-json.js";
import { applyPlaceholders } from "../assemble/placeholders.js";
import type { ProjectNames } from "../assemble/project-names.js";
import { moduleFiles } from "../assemble/resolve-modules.js";
import { compareModuleNames } from "../compare.js";
import { assemblableFiles } from "../kit/files.js";
import { readKitConfig, readKitManifests } from "../kit/kit-config.js";
import type { KitConfig } from "../kit/kit-config.js";
import type { ModuleManifest } from "../manifest/schema.js";

export type KitFile = { content: Buffer; mode: number };

export type KitSnapshot = {
  version: string;
  config: KitConfig;
  manifests: ModuleManifest[];
  files: Map<string, KitFile>;
};

const PERMISSION_BITS = 0o777;
const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK = "package-lock.json";

function selectManifests(
  modules: string[],
  available: ModuleManifest[],
  version: string,
): ModuleManifest[] {
  const byName = new Map(
    available.map((manifest) => [manifest.name, manifest]),
  );
  return [...new Set(modules)].sort(compareModuleNames).map((name) => {
    const manifest = byName.get(name);
    if (!manifest) {
      throw new Error(`Moduł ${name} nie istnieje w wa-kit ${version}`);
    }
    return manifest;
  });
}

async function readKitFile(
  kitDir: string,
  file: string,
  config: KitConfig,
  names: ProjectNames,
): Promise<KitFile> {
  const source = join(kitDir, file);
  const original = await readFile(source);
  const text = original.toString("utf8");
  const replaced = applyPlaceholders(file, text, config, names);
  return {
    content: replaced === text ? original : Buffer.from(replaced),
    mode: (await stat(source)).mode & PERMISSION_BITS,
  };
}

export async function readKitSnapshot(
  kitDir: string,
  modules: string[],
  names: ProjectNames,
): Promise<KitSnapshot> {
  const config = await readKitConfig(kitDir);
  const manifests = selectManifests(
    modules,
    await readKitManifests(kitDir),
    config.version,
  );
  const available = await assemblableFiles(kitDir, config);
  const files = new Map<string, KitFile>();
  for (const manifest of manifests) {
    for (const file of moduleFiles(manifest, available)) {
      if (file !== PACKAGE_LOCK) {
        files.set(file, await readKitFile(kitDir, file, config, names));
      }
    }
  }
  const packageJson = files.get(PACKAGE_JSON);
  if (packageJson) {
    files.set(PACKAGE_JSON, {
      content: Buffer.from(
        projectPackageJson(
          packageJson.content.toString("utf8"),
          manifests,
          names,
        ),
      ),
      mode: packageJson.mode,
    });
  }
  return { version: config.version, config, manifests, files };
}
