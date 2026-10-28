import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareCodePoint } from "../compare.js";
import { assemblableFiles, matchFiles } from "./files.js";
import { readKitConfig, readKitManifests } from "./kit-config.js";

export type OwnershipReport = {
  unowned: string[];
  multiOwned: { file: string; owners: string[] }[];
  globErrors: { module: string; glob: string; reason: "empty" | "brace" }[];
  unownedDependencies: string[];
  dependencyMismatch: {
    module: string;
    name: string;
    manifest: string;
    packageJson: string;
  }[];
  composeOutsideModule: string[];
};

const MISSING_IN_PACKAGE_JSON = "<brak>";

export async function checkOwnership(kitDir: string): Promise<OwnershipReport> {
  const config = await readKitConfig(kitDir);
  const manifests = await readKitManifests(kitDir);
  const files = await assemblableFiles(kitDir, config);

  const ownersByFile = new Map<string, string[]>();
  const globErrors: OwnershipReport["globErrors"] = [];
  const composeOutsideModule: string[] = [];

  for (const manifest of manifests) {
    const ownFiles = new Set<string>();
    for (const glob of manifest.files) {
      if (glob.includes("{")) {
        globErrors.push({ module: manifest.name, glob, reason: "brace" });
        continue;
      }
      const matched = matchFiles([glob], files);
      if (matched.length === 0) {
        globErrors.push({ module: manifest.name, glob, reason: "empty" });
      }
      for (const file of matched) ownFiles.add(file);
    }
    for (const file of ownFiles) {
      ownersByFile.set(file, [
        ...(ownersByFile.get(file) ?? []),
        manifest.name,
      ]);
    }
    if (manifest.compose !== null && !ownFiles.has(manifest.compose)) {
      composeOutsideModule.push(manifest.name);
    }
  }

  const unowned = files.filter((file) => !ownersByFile.has(file));
  const multiOwned = files
    .filter((file) => (ownersByFile.get(file)?.length ?? 0) > 1)
    .map((file) => ({ file, owners: ownersByFile.get(file) as string[] }));

  const packageJson = JSON.parse(
    await readFile(join(kitDir, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const installed: Record<string, string> = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const declared = new Set<string>();
  const dependencyMismatch: OwnershipReport["dependencyMismatch"] = [];
  for (const manifest of manifests) {
    const entries = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).sort(([a], [b]) => compareCodePoint(a, b));
    for (const [name, version] of entries) {
      declared.add(name);
      const installedVersion = installed[name];
      if (installedVersion !== version) {
        dependencyMismatch.push({
          module: manifest.name,
          name,
          manifest: version,
          packageJson: installedVersion ?? MISSING_IN_PACKAGE_JSON,
        });
      }
    }
  }
  dependencyMismatch.sort(
    (a, b) =>
      compareCodePoint(a.module, b.module) || compareCodePoint(a.name, b.name),
  );

  const unownedDependencies = Object.keys(installed)
    .filter((name) => !declared.has(name))
    .sort(compareCodePoint);

  return {
    unowned,
    multiOwned,
    globErrors,
    unownedDependencies,
    dependencyMismatch,
    composeOutsideModule,
  };
}
