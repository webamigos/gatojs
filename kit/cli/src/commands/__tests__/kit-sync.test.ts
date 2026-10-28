import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readKitState } from "../../manifest/kit-state.js";
import { kitSync } from "../kit-sync.js";

const fixtureKit = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/fixtures/kit",
);

let kitDir: string;

beforeEach(async () => {
  kitDir = await mkdtemp(join(tmpdir(), "wa-kit-sync-"));
  await cp(fixtureKit, kitDir, { recursive: true });
});

afterEach(async () => {
  await rm(kitDir, { recursive: true, force: true });
});

describe("kitSync", () => {
  it("pierwsze wywolanie zapisuje stan i zwraca changed true, drugie changed false", async () => {
    expect(await kitSync(kitDir)).toEqual({ changed: true });
    expect(Object.keys((await readKitState(kitDir)).modules)).toEqual([
      "core",
      "demo",
      "needs-demo",
    ]);
    expect(await kitSync(kitDir)).toEqual({ changed: false });
  });

  it("zapisuje wersje kitu, repo, projekt i locales z konfiguracji", async () => {
    await kitSync(kitDir);
    const state = JSON.parse(
      await readFile(join(kitDir, ".wa/kit.json"), "utf8"),
    );
    expect(Object.keys(state)).toEqual([
      "kitVersion",
      "kitRepo",
      "project",
      "locales",
      "modules",
      "projectModules",
    ]);
    expect(state.kitVersion).toBe("0.1.0");
    expect(state.kitRepo).toBe("https://github.com/webamigos/wa-kit.git");
    expect(state.project).toEqual({ name: "WA App", slug: "wa-app" });
    expect(state.locales).toEqual(["pl", "en"]);
  });

  it("wersje modulow pochodza z manifestow, a nie z wersji kitu", async () => {
    await kitSync(kitDir);
    const { modules } = await readKitState(kitDir);
    expect(modules["core"]?.version).toBe("0.2.0");
    expect(modules["demo"]?.version).toBe("0.3.0");
    expect(modules["needs-demo"]?.version).toBe("0.4.0");
    expect(modules["demo"]?.manifest.version).toBe("0.3.0");
    expect(modules["demo"]?.manifest.requires).toEqual([]);
    expect(modules["needs-demo"]?.manifest.requires).toEqual(["demo"]);
  });

  it("files kazdego modulu jest pustym obiektem", async () => {
    await kitSync(kitDir);
    const { modules } = await readKitState(kitDir);
    expect(modules["core"]?.files).toEqual({});
    expect(modules["demo"]?.files).toEqual({});
    expect(modules["needs-demo"]?.files).toEqual({});
  });

  it("drugie wywolanie zostawia plik bajtowo bez zmian", async () => {
    await kitSync(kitDir);
    const first = await readFile(join(kitDir, ".wa/kit.json"), "utf8");
    await kitSync(kitDir);
    expect(await readFile(join(kitDir, ".wa/kit.json"), "utf8")).toBe(first);
  });

  it("zmiana wersji modulu w kicie daje changed true i nowa wersje w stanie", async () => {
    await kitSync(kitDir);
    await writeFile(
      join(kitDir, "kit/modules/demo.json"),
      JSON.stringify({ name: "demo", version: "0.9.0", description: "Demo" }),
    );
    expect(await kitSync(kitDir)).toEqual({ changed: true });
    expect((await readKitState(kitDir)).modules["demo"]?.version).toBe("0.9.0");
    expect(await kitSync(kitDir)).toEqual({ changed: false });
  });

  it("katalog bez kit/kit.json konczy sie bledem i nie tworzy stanu", async () => {
    const empty = await mkdtemp(join(tmpdir(), "wa-kit-sync-empty-"));
    try {
      await expect(kitSync(empty)).rejects.toThrow(
        `Brak kit/kit.json w ${empty} — to nie jest repozytorium wa-kit`,
      );
      await expect(
        readFile(join(empty, ".wa/kit.json"), "utf8"),
      ).rejects.toThrow();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("niezgodna nazwa manifestu przerywa sync bez zapisu", async () => {
    await writeFile(
      join(kitDir, "kit/modules/demo.json"),
      JSON.stringify({ name: "inny", version: "0.3.0", description: "x" }),
    );
    await expect(kitSync(kitDir)).rejects.toThrow(
      'kit/modules/demo.json: name "inny" nie zgadza się z nazwą pliku',
    );
    await expect(
      readFile(join(kitDir, ".wa/kit.json"), "utf8"),
    ).rejects.toThrow();
  });
  it("zachowuje istniejacy wpis notes w projectModules", async () => {
    const notes = {
      manifest: {
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
        workspaces: [],
      },
    };
    await mkdir(join(kitDir, ".wa"), { recursive: true });
    await writeFile(
      join(kitDir, ".wa/kit.json"),
      JSON.stringify({
        kitVersion: "0.0.0",
        modules: {},
        projectModules: { notes },
      }),
    );
    await kitSync(kitDir);
    const state = await readKitState(kitDir);
    expect(state.projectModules).toEqual({ notes });
    expect(Object.keys(state.modules)).toEqual(["core", "demo", "needs-demo"]);
  });

  it("drugi kitSync z wpisem notes zwraca changed false", async () => {
    await mkdir(join(kitDir, ".wa"), { recursive: true });
    await writeFile(
      join(kitDir, ".wa/kit.json"),
      JSON.stringify({
        kitVersion: "0.0.0",
        modules: {},
        projectModules: {
          notes: {
            manifest: {
              name: "notes",
              version: "0.1.0",
              description: "Notatki",
              files: ["src/features/notes/**"],
            },
          },
        },
      }),
    );
    await kitSync(kitDir);
    expect(await kitSync(kitDir)).toEqual({ changed: false });
  });
});
