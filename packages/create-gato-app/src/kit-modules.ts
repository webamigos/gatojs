import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareNames } from "./compare.js";

export type KitModule = {
  name: string;
  description: string;
  requires: string[];
};

const CORE = "core";

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function parseKitModule(raw: unknown, file: string): KitModule {
  const invalid = new Error(`${file} is not a valid module manifest`);
  if (typeof raw !== "object" || raw === null) {
    throw invalid;
  }
  const { name, description, requires } = raw as Record<string, unknown>;
  if (typeof name !== "string" || name === "") {
    throw invalid;
  }
  if (description !== undefined && typeof description !== "string") {
    throw invalid;
  }
  if (requires !== undefined && !isStringArray(requires)) {
    throw invalid;
  }
  return { name, description: description ?? "", requires: requires ?? [] };
}

export async function readKitModules(kitDir: string): Promise<KitModule[]> {
  const dir = join(kitDir, "kit/modules");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  const modules: KitModule[] = [];
  for (const file of files) {
    const relative = `kit/modules/${file}`;
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`${relative} is not a valid module manifest`, {
        cause: error,
      });
    }
    const module = parseKitModule(raw, relative);
    if (module.name !== CORE) {
      modules.push(module);
    }
  }
  return modules.sort((a, b) => compareNames(a.name, b.name));
}

export function withRequired(
  selected: string[],
  modules: KitModule[],
): string[] {
  const byName = new Map(modules.map((module) => [module.name, module]));
  const chosen = new Set<string>();
  const pending = selected.filter((name) => name !== CORE);
  while (pending.length > 0) {
    const name = pending.pop() as string;
    const module = byName.get(name);
    if (module === undefined) {
      const available = modules.map((item) => item.name).join(", ");
      throw new Error(`Unknown module "${name}". Available: ${available}.`);
    }
    if (!chosen.has(name)) {
      chosen.add(name);
      pending.push(...module.requires.filter((required) => required !== CORE));
    }
  }
  return modules
    .map((module) => module.name)
    .filter((name) => chosen.has(name));
}
