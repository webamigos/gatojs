import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installedModules,
  projectModuleManifests,
  readKitState,
  registeredModules,
  writeKitState,
} from "../kit-state.js";
import { moduleManifestSchema } from "../schema.js";
import type { KitState } from "../schema.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "wa-kit-state-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function stateWith(names: string[], projectNames: string[] = []): KitState {
  return {
    kitVersion: "0.0.0",
    kitRepo: "https://github.com/webamigos/wa-kit.git",
    project: { name: "WA App", slug: "wa-app" },
    locales: ["pl", "en"],
    modules: Object.fromEntries(
      names.map((name) => [
        name,
        {
          version: "1.0.0",
          manifest: moduleManifestSchema.parse({
            name,
            version: "1.0.0",
            description: name,
          }),
          files: { [`src/features/${name}/module.ts`]: "a".repeat(64) },
        },
      ]),
    ),
    projectModules: Object.fromEntries(
      projectNames.map((name) => [
        name,
        {
          manifest: moduleManifestSchema.parse({
            name,
            version: "0.1.0",
            description: name,
            files: [`src/features/${name}/**`],
          }),
        },
      ]),
    ),
  };
}

const NOTES_MANIFEST = {
  name: "notes",
  version: "0.1.0",
  description: "Notatki",
  requires: [],
  files: ["src/features/notes/**", "prisma/schema/notes.prisma"],
  dependencies: {},
  devDependencies: {},
  env: [{ name: "NOTES_LIMIT", example: "10" }],
  schemaRelations: [{ model: "Organization", field: "notes Note[]" }],
  compose: null,
  ciSteps: null,
  workspaces: [],
};

const DEMO_ENTRY = {
  version: "1.0.0",
  manifest: {
    name: "demo",
    version: "1.0.0",
    description: "demo",
    files: ["src/features/demo/**"],
  },
  files: {},
};

async function writeRawState(raw: Record<string, unknown>): Promise<void> {
  await mkdir(join(tmp, ".wa"), { recursive: true });
  await writeFile(
    join(tmp, ".wa/kit.json"),
    JSON.stringify({ kitVersion: "0.0.0", ...raw }),
  );
}

describe("kit state", () => {
  it("readKitState zgłasza brak pliku z nazwą katalogu", async () => {
    await expect(readKitState(tmp)).rejects.toThrow(
      `Brak .wa/kit.json w ${tmp}`,
    );
  });

  it("writeKitState + readKitState round-trip, moduły posortowane", async () => {
    await writeKitState(tmp, stateWith(["uploads", "core", "api-keys"]));
    const raw = await readFile(join(tmp, ".wa/kit.json"), "utf8");
    expect(Object.keys(JSON.parse(raw).modules)).toEqual([
      "api-keys",
      "core",
      "uploads",
    ]);
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain('\n  "kitVersion"');
    expect(
      installedModules(await readKitState(tmp)).map((m) => m.name),
    ).toEqual(["core", "api-keys", "uploads"]);
  });

  it("readKitState odrzuca niepoprawny plik", async () => {
    await writeKitState(tmp, stateWith(["core"]));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(tmp, ".wa/kit.json"),
      JSON.stringify({ kitVersion: 1 }),
    );
    await expect(readKitState(tmp)).rejects.toThrow();
  });

  it("stary kit.json bez nowych pol dostaje wartosci domyslne", async () => {
    await mkdir(join(tmp, ".wa"), { recursive: true });
    await writeFile(
      join(tmp, ".wa/kit.json"),
      JSON.stringify({ kitVersion: "0.0.0", modules: {} }),
    );
    expect(await readKitState(tmp)).toEqual({
      kitVersion: "0.0.0",
      kitRepo: "https://github.com/webamigos/wa-kit.git",
      project: { name: "WA App", slug: "wa-app" },
      locales: ["pl", "en"],
      modules: {},
      projectModules: {},
    });
  });

  it("writeKitState zapisuje klucze w kolejnosci kitVersion, kitRepo, project, locales, modules, projectModules", async () => {
    await writeKitState(tmp, {
      kitVersion: "1.2.3",
      kitRepo: "https://example.com/kit.git",
      project: { name: "Moj", slug: "moj" },
      locales: ["pl"],
      modules: {},
      projectModules: {},
    });
    expect(await readFile(join(tmp, ".wa/kit.json"), "utf8")).toBe(
      '{\n  "kitVersion": "1.2.3",\n  "kitRepo": "https://example.com/kit.git",\n  "project": {\n    "name": "Moj",\n    "slug": "moj"\n  },\n  "locales": [\n    "pl"\n  ],\n  "modules": {},\n  "projectModules": {}\n}\n',
    );
  });

  it("writeKitState zapisuje te same klucze niezaleznie od kolejnosci w wejsciu", async () => {
    await writeKitState(tmp, {
      projectModules: {},
      modules: {},
      locales: ["pl"],
      project: { name: "Moj", slug: "moj" },
      kitRepo: "https://example.com/kit.git",
      kitVersion: "1.2.3",
    });
    expect(await readFile(join(tmp, ".wa/kit.json"), "utf8")).toBe(
      '{\n  "kitVersion": "1.2.3",\n  "kitRepo": "https://example.com/kit.git",\n  "project": {\n    "name": "Moj",\n    "slug": "moj"\n  },\n  "locales": [\n    "pl"\n  ],\n  "modules": {},\n  "projectModules": {}\n}\n',
    );
  });

  it("installedModules stawia core pierwszy, gdy w wejsciu jest po module alfabetycznie wczesniejszym", () => {
    expect(
      installedModules(stateWith(["core", "api-keys"])).map((m) => m.name),
    ).toEqual(["core", "api-keys"]);
    expect(
      installedModules(stateWith(["api-keys", "core"])).map((m) => m.name),
    ).toEqual(["core", "api-keys"]);
  });

  it("readKitState nie maskuje bledu innego niz brak pliku", async () => {
    await mkdir(join(tmp, ".wa/kit.json"), { recursive: true });
    const error = await readKitState(tmp).then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toContain("EISDIR");
    expect(error?.message).not.toContain("Brak .wa/kit.json");
  });
  it("writeKitState sortuje moduly projektu: zeta, alfa -> alfa, zeta", async () => {
    await writeKitState(tmp, stateWith([], ["zeta", "alfa"]));
    const raw = await readFile(join(tmp, ".wa/kit.json"), "utf8");
    expect(Object.keys(JSON.parse(raw).projectModules)).toEqual([
      "alfa",
      "zeta",
    ]);
    expect(raw.indexOf('"alfa"')).toBeLessThan(raw.indexOf('"zeta"'));
  });

  it("writeKitState + readKitState zachowuje modul projektu notes bez zmian", async () => {
    const state = stateWith([]);
    state.projectModules = { notes: { manifest: NOTES_MANIFEST } };
    await writeKitState(tmp, state);
    expect((await readKitState(tmp)).projectModules).toEqual({
      notes: { manifest: NOTES_MANIFEST },
    });
  });

  it("kit.json bez projectModules daje projectModules rowne pustemu obiektowi", async () => {
    await writeRawState({ modules: {} });
    expect((await readKitState(tmp)).projectModules).toEqual({});
  });

  it("readKitState odrzuca klucz projectModules inny niz manifest.name", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        notes: {
          manifest: {
            ...NOTES_MANIFEST,
            name: "inne",
            files: ["src/features/notes/**", "src/features/inne/**"],
          },
        },
      },
    });
    await expect(readKitState(tmp)).rejects.toThrow(
      'projectModules.notes: name "inne" nie zgadza się z kluczem',
    );
  });

  it("readKitState odrzuca nazwe jednoczesnie w modules i projectModules", async () => {
    await writeRawState({
      modules: { demo: DEMO_ENTRY },
      projectModules: {
        demo: { manifest: { ...DEMO_ENTRY.manifest } },
      },
    });
    await expect(readKitState(tmp)).rejects.toThrow(
      "Moduł demo jest jednocześnie modułem kitu i modułem projektu",
    );
  });

  it("readKitState odrzuca requires modulu projektu spoza modules i projectModules", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        notes: { manifest: { ...NOTES_MANIFEST, requires: ["uploads"] } },
      },
    });
    await expect(readKitState(tmp)).rejects.toThrow(
      "Moduł projektu notes wymaga niezainstalowanego modułu: uploads",
    );
  });

  it("readKitState odrzuca files modulu projektu bez wzorca src/features/<name>/", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        notes: { manifest: { ...NOTES_MANIFEST, files: ["lib/notes/**"] } },
      },
    });
    await expect(readKitState(tmp)).rejects.toThrow(
      "Moduł projektu notes: files musi obejmować src/features/notes/**",
    );
  });

  it("readKitState odrzuca files z katalogiem o nazwie zaczynajacej sie od nazwy modulu", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        notes: {
          manifest: {
            ...NOTES_MANIFEST,
            files: ["src/features/notes-extra/**"],
          },
        },
      },
    });
    await expect(readKitState(tmp)).rejects.toThrow(
      "Moduł projektu notes: files musi obejmować src/features/notes/**",
    );
  });

  it("readKitState odrzuca files modulu projektu ze wzorcem cudzego feature", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        notes: {
          manifest: { ...NOTES_MANIFEST, files: ["src/features/other/**"] },
        },
      },
    });
    await expect(readKitState(tmp)).rejects.toThrow(
      "Moduł projektu notes: files musi obejmować src/features/notes/**",
    );
  });

  it("readKitState przyjmuje modul projektu wymagajacy modulu kitu", async () => {
    await writeRawState({
      modules: { demo: DEMO_ENTRY },
      projectModules: {
        notes: { manifest: { ...NOTES_MANIFEST, requires: ["demo"] } },
      },
    });
    expect(
      (await readKitState(tmp)).projectModules["notes"]?.manifest.requires,
    ).toEqual(["demo"]);
  });

  it("readKitState przyjmuje modul projektu wymagajacy innego modulu projektu", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        notes: { manifest: { ...NOTES_MANIFEST, requires: ["tags"] } },
        tags: {
          manifest: {
            ...NOTES_MANIFEST,
            name: "tags",
            files: ["src/features/tags/**"],
          },
        },
      },
    });
    expect(
      (await readKitState(tmp)).projectModules["notes"]?.manifest.requires,
    ).toEqual(["tags"]);
  });

  it("projectModuleManifests zwraca manifesty alfabetycznie", () => {
    expect(
      projectModuleManifests(stateWith([], ["zeta", "alfa"])).map(
        (m) => m.name,
      ),
    ).toEqual(["alfa", "zeta"]);
  });

  it("projectModuleManifests bez modulow projektu zwraca pusta liste", () => {
    expect(projectModuleManifests(stateWith(["core"]))).toEqual([]);
  });

  it("registeredModules: core, moduly kitu alfabetycznie, potem moduly projektu alfabetycznie", () => {
    expect(
      registeredModules(
        stateWith(["uploads", "core", "api-keys"], ["zeta", "alfa"]),
      ).map((m) => m.name),
    ).toEqual(["core", "api-keys", "uploads", "alfa", "zeta"]);
  });
});
