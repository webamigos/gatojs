import { compareModuleNames } from "../compare.js";
import { matchFiles } from "../kit/files.js";
import type { ModuleManifest } from "../manifest/schema.js";

const CORE = "core";

export function resolveModules(
  requested: string[],
  available: ModuleManifest[],
): ModuleManifest[] {
  const byName = new Map(
    available.map((manifest) => [manifest.name, manifest]),
  );
  const resolved = new Map<string, ModuleManifest>();
  const pending = [CORE, ...requested];
  while (pending.length > 0) {
    const name = pending.pop() as string;
    if (resolved.has(name)) continue;
    const manifest = byName.get(name);
    if (!manifest) {
      const names = available
        .map((candidate) => candidate.name)
        .filter((candidate) => candidate !== CORE)
        .sort(compareModuleNames);
      throw new Error(`Nieznany moduł: ${name}. Dostępne: ${names.join(", ")}`);
    }
    resolved.set(name, manifest);
    pending.push(...manifest.requires);
  }
  return [...resolved.values()].sort((a, b) =>
    compareModuleNames(a.name, b.name),
  );
}

export function moduleFiles(
  manifest: ModuleManifest,
  files: string[],
): string[] {
  return matchFiles(manifest.files, files);
}
