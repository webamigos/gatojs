import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareCodePoint } from "../compare.js";
import { assemblableFiles, matchFiles } from "./files.js";
import { readKitConfig, readKitManifests } from "./kit-config.js";

const SECTIONS = ["dependencies", "devDependencies"] as const;

type DependencySection = (typeof SECTIONS)[number];

export type OwnershipReport = {
  unowned: string[];
  multiOwned: { file: string; owners: string[] }[];
  globErrors: { module: string; glob: string; reason: "empty" | "brace" }[];
  unownedDependencies: { section: DependencySection; name: string }[];
  dependencyMismatch: {
    module: string;
    section: DependencySection;
    name: string;
    manifest: string;
    packageJson: string;
  }[];
  composeOutsideModule: string[];
  selfhostComposeOutsideModule: string[];
};

const MISSING_IN_PACKAGE_JSON = "<missing>";

export async function checkOwnership(kitDir: string): Promise<OwnershipReport> {
  const config = await readKitConfig(kitDir);
  const manifests = await readKitManifests(kitDir);
  const files = await assemblableFiles(kitDir, config);

  const ownersByFile = new Map<string, string[]>();
  const globErrors: OwnershipReport["globErrors"] = [];
  const composeOutsideModule: string[] = [];
  const selfhostComposeOutsideModule: string[] = [];

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
      for (const file of matched) {
        ownFiles.add(file);
      }
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
    if (
      manifest.selfhostCompose !== null &&
      !ownFiles.has(manifest.selfhostCompose)
    ) {
      selfhostComposeOutsideModule.push(manifest.name);
    }
  }

  const unowned = files.filter((file) => !ownersByFile.has(file));
  const multiOwned = files
    .filter((file) => (ownersByFile.get(file)?.length ?? 0) > 1)
    .map((file) => ({ file, owners: ownersByFile.get(file) as string[] }));

  const packageJson = JSON.parse(
    await readFile(join(kitDir, "package.json"), "utf8"),
  ) as Partial<Record<DependencySection, Record<string, string>>>;
  const declared: Record<DependencySection, Set<string>> = {
    dependencies: new Set(),
    devDependencies: new Set(),
  };
  const dependencyMismatch: OwnershipReport["dependencyMismatch"] = [];
  for (const manifest of manifests) {
    for (const section of SECTIONS) {
      for (const [name, version] of Object.entries(manifest[section])) {
        declared[section].add(name);
        const installedVersion = packageJson[section]?.[name];
        if (installedVersion !== version) {
          dependencyMismatch.push({
            module: manifest.name,
            section,
            name,
            manifest: version,
            packageJson: installedVersion ?? MISSING_IN_PACKAGE_JSON,
          });
        }
      }
    }
  }
  dependencyMismatch.sort(
    (a, b) =>
      compareCodePoint(a.module, b.module) ||
      SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
      compareCodePoint(a.name, b.name),
  );

  const unownedDependencies = SECTIONS.flatMap((section) =>
    Object.keys(packageJson[section] ?? {})
      .filter((name) => !declared[section].has(name))
      .sort(compareCodePoint)
      .map((name) => ({ section, name })),
  );

  globErrors.sort(
    (a, b) =>
      compareCodePoint(a.module, b.module) || compareCodePoint(a.glob, b.glob),
  );
  composeOutsideModule.sort(compareCodePoint);
  selfhostComposeOutsideModule.sort(compareCodePoint);

  return {
    unowned,
    multiOwned,
    globErrors,
    unownedDependencies,
    dependencyMismatch,
    composeOutsideModule,
    selfhostComposeOutsideModule,
  };
}
