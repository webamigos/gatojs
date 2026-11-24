import { describe, expect, it } from "vitest";
import type { KitState, ModuleManifest } from "../../manifest/schema.js";
import { list } from "../list.js";

function manifest(
  name: string,
  version: string,
  description: string,
  requires: string[] = [],
): ModuleManifest {
  return {
    name,
    version,
    description,
    requires,
    files: [`src/features/${name}/**`],
    dependencies: {},
    devDependencies: {},
    env: [],
    schemaRelations: [],
    compose: null,
    ciSteps: null,
    workspaces: [],
  };
}

function stateWith(
  installed: ModuleManifest[],
  projectModules: ModuleManifest[] = [],
): KitState {
  return {
    kitVersion: "0.1.0",
    kitRepo: "https://github.com/webamigos/wa-kit.git",
    project: { name: "App", slug: "app" },
    locales: ["pl", "en"],
    modules: Object.fromEntries(
      installed.map((m) => [
        m.name,
        { version: m.version, manifest: m, files: {} },
      ]),
    ),
    projectModules: Object.fromEntries(
      projectModules.map((m) => [m.name, { manifest: m }]),
    ),
  };
}

const core = manifest("core", "0.1.0", "Rdzeń");
const demo = manifest("demo", "1.0.0", "Demo");
const needsDemo = manifest("needs-demo", "1.0.0", "Wymaga dema", ["demo"]);

function render(options: {
  state: KitState;
  available: ModuleManifest[] | null;
  availableError?: string | null;
}): string[] {
  const lines: string[] = [];
  list({
    state: options.state,
    available: options.available,
    availableError: options.availableError ?? null,
    log: (line) => lines.push(line),
  });
  return lines;
}

describe("list", () => {
  it("wypisuje zainstalowane i dostępne moduły", () => {
    expect(
      render({
        state: stateWith([core, demo]),
        available: [core, demo, needsDemo],
      }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "  demo 1.0.0",
      "Available:",
      "  needs-demo 1.0.0 — Wymaga dema (requires: demo)",
    ]);
  });

  it("moduł dostępny bez zależności nie ma sufiksu wymaga", () => {
    expect(
      render({ state: stateWith([core]), available: [core, demo] }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "Available:",
      "  demo 1.0.0 — Demo",
    ]);
  });

  it("wiele zależności łączy przecinkiem", () => {
    const many = manifest("many", "2.0.0", "Dużo", ["demo", "other"]);
    expect(render({ state: stateWith([core]), available: [many] })).toEqual([
      "Installed:",
      "  core 0.1.0",
      "Available:",
      "  many 2.0.0 — Dużo (requires: demo, other)",
    ]);
  });

  it("rdzeń jest pierwszy, a reszta alfabetycznie niezależnie od kolejności w stanie", () => {
    const zeta = manifest("zeta", "1.0.0", "Z");
    expect(
      render({ state: stateWith([zeta, demo, core]), available: [] }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "  demo 1.0.0",
      "  zeta 1.0.0",
      "Available: none",
    ]);
  });

  it("dostępne są alfabetycznie", () => {
    const beta = manifest("beta", "1.0.0", "B");
    const alpha = manifest("alpha", "1.0.0", "A");
    expect(
      render({ state: stateWith([core]), available: [beta, alpha] }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "Available:",
      "  alpha 1.0.0 — A",
      "  beta 1.0.0 — B",
    ]);
  });

  it("pomija zainstalowane moduły i rdzeń w dostępnych", () => {
    expect(
      render({
        state: stateWith([core, demo]),
        available: [needsDemo, demo, core],
      }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "  demo 1.0.0",
      "Available:",
      "  needs-demo 1.0.0 — Wymaga dema (requires: demo)",
    ]);
  });

  it("gdy wszystkie moduły kitu są zainstalowane pisze Dostępne: brak", () => {
    expect(
      render({
        state: stateWith([core, demo, needsDemo]),
        available: [core, demo, needsDemo],
      }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "  demo 1.0.0",
      "  needs-demo 1.0.0",
      "Available: none",
    ]);
  });

  it("gdy nie udało się pobrać kitu pokazuje błąd", () => {
    expect(
      render({
        state: stateWith([core, demo]),
        available: null,
        availableError: "brak sieci",
      }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "  demo 1.0.0",
      "Available: could not fetch the kit (brak sieci)",
    ]);
  });

  it("moduł projektu trafia do grupy Projektu na końcu", () => {
    const notes = manifest("notes", "1.0.0", "Notatki");
    expect(
      render({
        state: stateWith([core, demo], [notes]),
        available: [core, demo, needsDemo],
      }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "  demo 1.0.0",
      "Available:",
      "  needs-demo 1.0.0 — Wymaga dema (requires: demo)",
      "Project modules:",
      "  notes — Notatki",
    ]);
  });

  it("moduły projektu są alfabetyczne", () => {
    const zebra = manifest("zebra", "1.0.0", "Zebry");
    const notes = manifest("notes", "1.0.0", "Notatki");
    expect(
      render({ state: stateWith([core], [zebra, notes]), available: [core] }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "Available: none",
      "Project modules:",
      "  notes — Notatki",
      "  zebra — Zebry",
    ]);
  });

  it("moduł projektu jest pokazany także gdy kit jest niedostępny", () => {
    const notes = manifest("notes", "1.0.0", "Notatki");
    expect(
      render({
        state: stateWith([core], [notes]),
        available: null,
        availableError: "brak sieci",
      }),
    ).toEqual([
      "Installed:",
      "  core 0.1.0",
      "Available: could not fetch the kit (brak sieci)",
      "Project modules:",
      "  notes — Notatki",
    ]);
  });

  it("bez modułów projektu nie ma grupy Projektu", () => {
    const lines = render({ state: stateWith([core]), available: [core] });
    expect(lines).not.toContain("Project modules:");
    expect(lines).toEqual(["Installed:", "  core 0.1.0", "Available: none"]);
  });

  it("moduły projektu nie trafiają do zainstalowanych ani dostępnych", () => {
    const notes = manifest("notes", "1.0.0", "Notatki");
    const lines = render({
      state: stateWith([core], [notes]),
      available: [core, demo],
    });
    expect(lines.slice(0, 4)).toEqual([
      "Installed:",
      "  core 0.1.0",
      "Available:",
      "  demo 1.0.0 — Demo",
    ]);
  });

  it("rdzeń nieobecny w stanie nie pojawia się w dostępnych", () => {
    expect(
      render({
        state: stateWith([demo]),
        available: [core, demo],
      }),
    ).toEqual(["Installed:", "  demo 1.0.0", "Available: none"]);
  });
});
