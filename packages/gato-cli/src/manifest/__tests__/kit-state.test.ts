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
    kitFormat: 1,
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
    ejected: {},
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
  selfhostCompose: null,
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
      `No .wa/kit.json in ${tmp}`,
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
      kitFormat: 1,
      project: { name: "WA App", slug: "wa-app" },
      locales: ["pl", "en"],
      modules: {},
      projectModules: {},
      ejected: {},
    });
  });

  it("writeKitState zapisuje klucze w kolejnosci kitVersion, kitRepo, kitFormat, project, locales, modules, projectModules, ejected", async () => {
    await writeKitState(tmp, {
      kitVersion: "1.2.3",
      kitRepo: "https://example.com/kit.git",
      kitFormat: 2,
      project: { name: "Moj", slug: "moj" },
      locales: ["pl"],
      modules: {},
      projectModules: {},
      ejected: {},
    });
    expect(await readFile(join(tmp, ".wa/kit.json"), "utf8")).toBe(
      '{\n  "kitVersion": "1.2.3",\n  "kitRepo": "https://example.com/kit.git",\n  "kitFormat": 2,\n  "project": {\n    "name": "Moj",\n    "slug": "moj"\n  },\n  "locales": [\n    "pl"\n  ],\n  "modules": {},\n  "projectModules": {},\n  "ejected": {}\n}\n',
    );
  });

  it("writeKitState zapisuje te same klucze niezaleznie od kolejnosci w wejsciu", async () => {
    await writeKitState(tmp, {
      ejected: {},
      projectModules: {},
      modules: {},
      locales: ["pl"],
      project: { name: "Moj", slug: "moj" },
      kitFormat: 2,
      kitRepo: "https://example.com/kit.git",
      kitVersion: "1.2.3",
    });
    expect(await readFile(join(tmp, ".wa/kit.json"), "utf8")).toBe(
      '{\n  "kitVersion": "1.2.3",\n  "kitRepo": "https://example.com/kit.git",\n  "kitFormat": 2,\n  "project": {\n    "name": "Moj",\n    "slug": "moj"\n  },\n  "locales": [\n    "pl"\n  ],\n  "modules": {},\n  "projectModules": {},\n  "ejected": {}\n}\n',
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
    expect(error?.message).not.toContain("No .wa/kit.json");
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
      'projectModules.notes: name "inne" does not match the key',
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
      "Module demo is both a kit module and a project module",
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
      "Project module notes requires a module that is not installed: uploads",
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
      "Project module notes: files must cover src/features/notes/**",
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
      "Project module notes: files must cover src/features/notes/**",
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
      "Project module notes: files must cover src/features/notes/**",
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

const UNSUPPORTED_FORMAT_99 =
  "This project uses kit format 99; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>";

const LOGIN_EJECTED = { reason: "custom login", ejectedAt: "2026-11-23" };
const BUTTON_EJECTED = { reason: "brand button", ejectedAt: "2026-11-24" };

describe("kit state: the reserved project module key app", () => {
  it("readKitState rejects a project module keyed app", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        app: {
          manifest: {
            ...NOTES_MANIFEST,
            name: "app",
            files: ["src/features/app/**"],
          },
        },
      },
    });
    await expect(readKitState(tmp)).rejects.toThrow(
      'projectModules.app: "app" is reserved for core-hosted slot config (modules.app)',
    );
  });

  it("readKitState accepts a project module keyed apps", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        apps: {
          manifest: {
            ...NOTES_MANIFEST,
            name: "apps",
            files: ["src/features/apps/**"],
          },
        },
      },
    });
    expect(Object.keys((await readKitState(tmp)).projectModules)).toEqual([
      "apps",
    ]);
  });

  it("readKitState accepts a project module keyed app-store", async () => {
    await writeRawState({
      modules: {},
      projectModules: {
        "app-store": {
          manifest: {
            ...NOTES_MANIFEST,
            name: "app-store",
            files: ["src/features/app-store/**"],
          },
        },
      },
    });
    expect(Object.keys((await readKitState(tmp)).projectModules)).toEqual([
      "app-store",
    ]);
  });
});

describe("kit state: kitFormat and ejected", () => {
  it("readKitState of a file without kitFormat and ejected gives format 1 and no ejected files", async () => {
    await writeRawState({ modules: {} });
    const state = await readKitState(tmp);
    expect(state.kitFormat).toBe(1);
    expect(state.ejected).toEqual({});
  });

  it("readKitState keeps kitFormat 2 and an ejected entry", async () => {
    await writeRawState({
      kitFormat: 2,
      modules: {},
      ejected: { "src/a.ts": LOGIN_EJECTED },
    });
    const state = await readKitState(tmp);
    expect(state.kitFormat).toBe(2);
    expect(state.ejected).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
    });
  });

  it("readKitState of kitFormat 99 rejects with the update gato-cli message", async () => {
    await writeRawState({ kitFormat: 99, modules: {} });
    await expect(readKitState(tmp)).rejects.toMatchObject({
      message: UNSUPPORTED_FORMAT_99,
    });
  });

  it("readKitState keeps kitFormat 4", async () => {
    await writeRawState({ kitFormat: 4, modules: {} });
    const state = await readKitState(tmp);
    expect(state.kitFormat).toBe(4);
  });

  it("readKitState keeps kitFormat 6", async () => {
    await writeRawState({ kitFormat: 6, modules: {} });
    const state = await readKitState(tmp);
    expect(state.kitFormat).toBe(6);
  });

  it("readKitState keeps kitFormat 7", async () => {
    await writeRawState({ kitFormat: 7, modules: {} });
    const state = await readKitState(tmp);
    expect(state.kitFormat).toBe(7);
  });

  it("readKitState keeps kitFormat 8", async () => {
    await writeRawState({ kitFormat: 8, modules: {} });
    const state = await readKitState(tmp);
    expect(state.kitFormat).toBe(8);
  });

  it("readKitState of kitFormat 9 rejects with the update gato-cli message", async () => {
    await writeRawState({ kitFormat: 9, modules: {} });
    await expect(readKitState(tmp)).rejects.toThrow(
      "This project uses kit format 9; update gato-cli (npm i -D gato-cli@latest)",
    );
  });

  it("readKitState rejects an ejected entry with a blank reason", async () => {
    await writeRawState({
      modules: {},
      ejected: { "src/a.ts": { reason: "  ", ejectedAt: "2026-11-23" } },
    });
    await expect(readKitState(tmp)).rejects.toThrow();
  });

  it("writeKitState writes the keys in the order kitVersion, kitRepo, kitFormat, project, locales, modules, projectModules, ejected", async () => {
    await writeKitState(tmp, {
      ...stateWith(["core"], ["notes"]),
      kitFormat: 2,
      ejected: { "src/a.ts": LOGIN_EJECTED },
    });
    const raw = await readFile(join(tmp, ".wa/kit.json"), "utf8");
    expect(Object.keys(JSON.parse(raw))).toEqual([
      "kitVersion",
      "kitRepo",
      "kitFormat",
      "project",
      "locales",
      "modules",
      "projectModules",
      "ejected",
    ]);
    expect(raw).toContain(
      '\n  "kitRepo": "https://github.com/webamigos/wa-kit.git",\n  "kitFormat": 2,\n  "project": {',
    );
  });

  it("writeKitState writes ejected sorted by path: src/b.ts, src/a.ts -> src/a.ts, src/b.ts", async () => {
    await writeKitState(tmp, {
      ...stateWith([]),
      ejected: { "src/b.ts": BUTTON_EJECTED, "src/a.ts": LOGIN_EJECTED },
    });
    const raw = await readFile(join(tmp, ".wa/kit.json"), "utf8");
    expect(Object.keys(JSON.parse(raw).ejected)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(raw.indexOf('"src/a.ts"')).toBeGreaterThan(-1);
    expect(raw.indexOf('"src/a.ts"')).toBeLessThan(raw.indexOf('"src/b.ts"'));
  });

  it("writeKitState sorts ejected by code point, so an uppercase path comes before a lowercase one", async () => {
    await writeKitState(tmp, {
      ...stateWith([]),
      ejected: { "src/a.ts": LOGIN_EJECTED, "src/Z.ts": BUTTON_EJECTED },
    });
    const raw = await readFile(join(tmp, ".wa/kit.json"), "utf8");
    expect(Object.keys(JSON.parse(raw).ejected)).toEqual([
      "src/Z.ts",
      "src/a.ts",
    ]);
  });

  it("writeKitState writes the ejected entry as the last block of the file", async () => {
    await writeKitState(tmp, {
      ...stateWith([]),
      ejected: { "src/a.ts": LOGIN_EJECTED },
    });
    expect(
      (await readFile(join(tmp, ".wa/kit.json"), "utf8")).endsWith(
        '  "projectModules": {},\n  "ejected": {\n    "src/a.ts": {\n      "reason": "custom login",\n      "ejectedAt": "2026-11-23"\n    }\n  }\n}\n',
      ),
    ).toBe(true);
  });

  it("an ejected entry survives readKitState and writeKitState byte for byte", async () => {
    await writeKitState(tmp, {
      ...stateWith(["core"]),
      kitFormat: 2,
      ejected: { "src/b.ts": BUTTON_EJECTED, "src/a.ts": LOGIN_EJECTED },
    });
    const first = await readFile(join(tmp, ".wa/kit.json"), "utf8");
    const state = await readKitState(tmp);
    expect(state.ejected).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
      "src/b.ts": { reason: "brand button", ejectedAt: "2026-11-24" },
    });
    await writeKitState(tmp, state);
    expect(await readFile(join(tmp, ".wa/kit.json"), "utf8")).toBe(first);
  });

  it("writeKitState keeps kitFormat 1 of an old project", async () => {
    await writeRawState({ modules: {} });
    await writeKitState(tmp, await readKitState(tmp));
    expect(
      JSON.parse(await readFile(join(tmp, ".wa/kit.json"), "utf8")).kitFormat,
    ).toBe(1);
  });
});
