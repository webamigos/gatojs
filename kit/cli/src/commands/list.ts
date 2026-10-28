import { compareCodePoint, compareModuleNames } from "../compare.js";
import type { KitState, ModuleManifest } from "../manifest/schema.js";

export type ListOptions = {
  state: KitState;
  available: ModuleManifest[] | null;
  availableError: string | null;
  log: (line: string) => void;
};

function availableLine(manifest: ModuleManifest): string {
  const needs =
    manifest.requires.length > 0
      ? ` (wymaga: ${manifest.requires.join(", ")})`
      : "";
  return `  ${manifest.name} ${manifest.version} — ${manifest.description}${needs}`;
}

export function list(options: ListOptions): void {
  const { state, available, availableError, log } = options;
  log("Zainstalowane:");
  for (const [name, entry] of Object.entries(state.modules).sort(([a], [b]) =>
    compareModuleNames(a, b),
  )) {
    log(`  ${name} ${entry.version}`);
  }
  if (available === null) {
    log(`Dostępne: nie udało się pobrać kitu (${availableError})`);
  } else {
    const rest = available
      .filter(
        (manifest) =>
          manifest.name !== "core" && !(manifest.name in state.modules),
      )
      .sort((a, b) => compareCodePoint(a.name, b.name));
    if (rest.length === 0) {
      log("Dostępne: brak");
    } else {
      log("Dostępne:");
      for (const manifest of rest) {
        log(availableLine(manifest));
      }
    }
  }
  const projectEntries = Object.entries(state.projectModules).sort(([a], [b]) =>
    compareCodePoint(a, b),
  );
  if (projectEntries.length > 0) {
    log("Projektu:");
    for (const [name, { manifest }] of projectEntries) {
      log(`  ${name} — ${manifest.description}`);
    }
  }
}
