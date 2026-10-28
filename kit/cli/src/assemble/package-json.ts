import { compareCodePoint } from "../compare.js";
import type { ModuleManifest } from "../manifest/schema.js";
import type { ProjectNames } from "./project-names.js";

type Dependencies = Record<string, string>;
type PackageJson = Record<string, unknown>;

const SECTIONS = ["dependencies", "devDependencies"] as const;

function sortedKeys(dependencies: Dependencies): Dependencies {
  return Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => compareCodePoint(a, b)),
  );
}

function serialize(packageJson: PackageJson): string {
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function sumDependencies(
  manifests: ModuleManifest[],
  section: (typeof SECTIONS)[number],
): Dependencies {
  return sortedKeys(
    Object.assign({}, ...manifests.map((manifest) => manifest[section])),
  );
}

export function projectPackageJson(
  kitPackageJson: string,
  manifests: ModuleManifest[],
  names: ProjectNames,
): string {
  const packageJson = JSON.parse(kitPackageJson) as PackageJson;
  packageJson.name = names.slug;
  packageJson.version = "0.1.0";
  packageJson.dependencies = sumDependencies(manifests, "dependencies");
  packageJson.devDependencies = sumDependencies(manifests, "devDependencies");
  return serialize(packageJson);
}

export function addDependencies(
  packageJson: string,
  manifest: ModuleManifest,
): string {
  const parsed = JSON.parse(packageJson) as PackageJson;
  for (const section of SECTIONS) {
    if (Object.keys(manifest[section]).length === 0) continue;
    const existing = (parsed[section] ?? {}) as Dependencies;
    parsed[section] = sortedKeys({ ...manifest[section], ...existing });
  }
  return serialize(parsed);
}

export function removeDependencies(
  packageJson: string,
  removed: ModuleManifest,
  remaining: ModuleManifest[],
): string {
  const parsed = JSON.parse(packageJson) as PackageJson;
  for (const section of SECTIONS) {
    const existing = parsed[section] as Dependencies | undefined;
    if (!existing) continue;
    const stillNeeded = new Set(
      remaining.flatMap((manifest) => Object.keys(manifest[section])),
    );
    const next = { ...existing };
    for (const name of Object.keys(removed[section])) {
      if (!stillNeeded.has(name)) delete next[name];
    }
    parsed[section] = next;
  }
  return serialize(parsed);
}
