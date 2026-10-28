import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  IGNORE,
  removeTempDirs,
  snapshotDir,
} from "../../__tests__/helpers.js";
import { readKitState, writeKitState } from "../../manifest/kit-state.js";
import type { ModuleManifest } from "../../manifest/schema.js";
import type { Runner } from "../../process/runner.js";
import { remove } from "../remove.js";

let runner: ReturnType<typeof vi.fn<Runner>>;
let log: ReturnType<typeof vi.fn<(line: string) => void>>;

beforeEach(() => {
  runner = vi.fn<Runner>(async () => {});
  log = vi.fn<(line: string) => void>();
});

afterEach(async () => {
  await removeTempDirs();
});

function projectManifest(
  name: string,
  overrides: Partial<ModuleManifest> = {},
): ModuleManifest {
  return {
    name,
    version: "1.0.0",
    description: `Moduł ${name}`,
    requires: [],
    files: [`src/features/${name}/**`],
    dependencies: {},
    devDependencies: {},
    env: [],
    schemaRelations: [],
    compose: null,
    workspaces: [],
    ...overrides,
  };
}

async function addProjectModules(
  dir: string,
  manifests: ModuleManifest[],
): Promise<void> {
  const state = await readKitState(dir);
  const projectModules = { ...state.projectModules };
  for (const manifest of manifests) {
    projectModules[manifest.name] = { manifest };
  }
  await writeKitState(dir, { ...state, projectModules });
}

async function writeProjectFile(
  dir: string,
  relative: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content);
}

function removeOptions(
  dir: string,
  module: string,
  overrides: { force?: boolean; install?: boolean } = {},
) {
  return {
    projectDir: dir,
    module,
    force: overrides.force ?? false,
    install: overrides.install ?? false,
    runner,
    log,
  };
}

describe("remove", () => {
  it("create demo, potem remove demo daje to samo co create bez modułów", async () => {
    const dir = await createProject("app", ["demo"]);
    await remove(removeOptions(dir, "demo"));
    const bare = await createProject("app", [], "other");
    expect(await snapshotDir(dir, IGNORE)).toEqual(
      await snapshotDir(bare, IGNORE),
    );
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
  });

  it("zwraca listę usuniętych modułów", async () => {
    const dir = await createProject("app", ["demo"]);
    expect(await remove(removeOptions(dir, "demo"))).toEqual({
      removed: ["demo"],
    });
  });

  it("usuwa moduł z .wa/kit.json i zostawia rdzeń", async () => {
    const dir = await createProject("app", ["demo"]);
    await remove(removeOptions(dir, "demo"));
    const state = await readKitState(dir);
    expect(Object.keys(state.modules)).toEqual(["core"]);
  });

  it("remove needs-demo zostawia zainstalowany demo", async () => {
    const dir = await createProject("app", ["needs-demo"]);
    const result = await remove(removeOptions(dir, "needs-demo"));
    expect(result).toEqual({ removed: ["needs-demo"] });
    const state = await readKitState(dir);
    expect(Object.keys(state.modules)).toEqual(["core", "demo"]);
    expect(existsSync(join(dir, "src/features/demo/module.ts"))).toBe(true);
    expect(existsSync(join(dir, "src/features/needs-demo"))).toBe(false);
  });

  it("zmieniony plik bez --force kończy się błędem i nie zmienia projektu", async () => {
    const dir = await createProject("app", ["demo"]);
    await appendFile(join(dir, "src/features/demo/module.ts"), "\n");
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(remove(removeOptions(dir, "demo"))).rejects.toThrow(
      "Zmienione pliki modułu demo (użyj --force)",
    );
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("komunikat o zmianach wymienia dokładnie zmienione pliki", async () => {
    const dir = await createProject("app", ["demo"]);
    await appendFile(join(dir, "src/features/demo/module.ts"), "\n");
    await appendFile(join(dir, "src/features/demo/env.ts"), "\n");
    await expect(remove(removeOptions(dir, "demo"))).rejects.toMatchObject({
      message:
        "Zmienione pliki modułu demo (użyj --force):\n  src/features/demo/env.ts\n  src/features/demo/module.ts",
    });
  });

  it("niezmieniony projekt nie jest odrzucany z powodu zmian", async () => {
    const dir = await createProject("app", ["demo"]);
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
  });

  it("zmiana pliku modułu z --force usuwa moduł mimo zmian", async () => {
    const dir = await createProject("app", ["demo"]);
    await appendFile(join(dir, "src/features/demo/module.ts"), "\n");
    await remove(removeOptions(dir, "demo", { force: true }));
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
    const state = await readKitState(dir);
    expect(Object.keys(state.modules)).toEqual(["core"]);
  });

  it("zmiana poza regionem w pliku regionów liczy się jako zmiana", async () => {
    const dir = await createProject("app", ["demo"]);
    const state = await readKitState(dir);
    const envHash = state.modules.core?.files[".env.example"] as string;
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await writeKitState(dir, {
      ...state,
      modules: {
        ...state.modules,
        demo: { ...demo, files: { ...demo.files, ".env.example": envHash } },
      },
    });
    const envPath = join(dir, ".env.example");
    const content = await readFile(envPath, "utf8");
    await writeFile(envPath, `ZMIANA=1\n${content}`);
    await expect(remove(removeOptions(dir, "demo"))).rejects.toThrow(
      "Zmienione pliki modułu demo (użyj --force):\n  .env.example",
    );
  });

  it("zmiana tylko w treści regionu wa:* nie liczy się jako zmiana", async () => {
    const dir = await createProject("app", ["demo"]);
    const state = await readKitState(dir);
    const envHash = state.modules.core?.files[".env.example"] as string;
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await writeKitState(dir, {
      ...state,
      modules: {
        ...state.modules,
        demo: { ...demo, files: { ...demo.files, ".env.example": envHash } },
      },
    });
    const envPath = join(dir, ".env.example");
    const content = await readFile(envPath, "utf8");
    await writeFile(
      envPath,
      content.replace(
        "# wa:modules:start",
        "# wa:modules:start\nINNA_ZMIENNA=1",
      ),
    );
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
  });

  it("brakujący plik modułu nie blokuje remove", async () => {
    const dir = await createProject("app", ["demo"]);
    await rm(join(dir, "src/features/demo/env.ts"));
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
  });

  it("remove core kończy się błędem o rdzeniu", async () => {
    const dir = await createProject("app", ["demo"]);
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      remove(removeOptions(dir, "core", { force: true })),
    ).rejects.toThrow("Nie można usunąć rdzenia");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
  });

  it("niezainstalowany moduł kończy się błędem", async () => {
    const dir = await createProject("app", []);
    await expect(remove(removeOptions(dir, "needs-demo"))).rejects.toThrow(
      "Moduł needs-demo nie jest zainstalowany",
    );
  });

  it("demo wymagane przez needs-demo kończy się odmową bez zmian", async () => {
    const dir = await createProject("app", ["needs-demo"]);
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      remove(removeOptions(dir, "demo", { force: true })),
    ).rejects.toThrow("Moduł demo jest wymagany przez: needs-demo");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
  });

  it("demo wymagane tylko przez moduł projektu notes kończy się odmową", async () => {
    const dir = await createProject("app", ["demo"]);
    await addProjectModules(dir, [
      projectManifest("notes", { requires: ["demo"] }),
    ]);
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      remove(removeOptions(dir, "demo", { force: true })),
    ).rejects.toMatchObject({
      message: "Moduł demo jest wymagany przez: notes",
    });
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
  });

  it("lista wymagających łączy moduły kitu i projektu alfabetycznie", async () => {
    const dir = await createProject("app", ["needs-demo"]);
    await addProjectModules(dir, [
      projectManifest("notes", { requires: ["demo"] }),
      projectManifest("alpha", { requires: ["demo"] }),
    ]);
    await expect(
      remove(removeOptions(dir, "demo", { force: true })),
    ).rejects.toMatchObject({
      message: "Moduł demo jest wymagany przez: alpha, needs-demo, notes",
    });
  });

  it("remove notes (moduł projektu) kończy się komunikatem i nie usuwa plików", async () => {
    const dir = await createProject("app", ["demo"]);
    await addProjectModules(dir, [projectManifest("notes")]);
    await writeProjectFile(dir, "src/features/notes/module.ts", "notes\n");
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      remove(removeOptions(dir, "notes", { force: true })),
    ).rejects.toMatchObject({
      message:
        "Moduł notes należy do projektu; wa remove usuwa tylko moduły kitu. Usuń jego pliki i wpis w projectModules ręcznie",
    });
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
  });

  it("zależność left-pad deklarowana też przez moduł projektu zostaje w package.json", async () => {
    const dir = await createProject("app", ["demo"]);
    await addProjectModules(dir, [
      projectManifest("notes", { dependencies: { "left-pad": "^1.3.0" } }),
    ]);
    await remove(removeOptions(dir, "demo"));
    const packageJson = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies).toEqual({
      "left-pad": "^1.3.0",
      zod: "^4.3.6",
    });
  });

  it("zależność left-pad bez innych użytkowników znika z package.json", async () => {
    const dir = await createProject("app", ["demo"]);
    await addProjectModules(dir, [projectManifest("notes")]);
    await remove(removeOptions(dir, "demo"));
    const packageJson = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies).toEqual({ zod: "^4.3.6" });
  });

  it("zachowuje wpisy projectModules w .wa/kit.json", async () => {
    const dir = await createProject("app", ["demo"]);
    await addProjectModules(dir, [projectManifest("notes")]);
    await remove(removeOptions(dir, "demo"));
    const state = await readKitState(dir);
    expect(Object.keys(state.projectModules)).toEqual(["notes"]);
  });

  it("usuwa puste katalogi nadrzędne, ale zostawia katalog z plikiem spoza modułu", async () => {
    const dir = await createProject("app", ["demo"]);
    await writeProjectFile(dir, "src/features/demo/i18n/obcy.json", "{}\n");
    await remove(removeOptions(dir, "demo", { force: true }));
    expect(existsSync(join(dir, "src/features/demo/i18n/obcy.json"))).toBe(
      true,
    );
    expect(existsSync(join(dir, "src/features/demo/module.ts"))).toBe(false);
    expect(existsSync(join(dir, "src/features/demo/i18n/pl.json"))).toBe(false);
    expect(existsSync(join(dir, "src/features"))).toBe(true);
  });

  it("katalogi niepuste po usunięciu modułu zostają, a puste znikają aż do pierwszego niepustego", async () => {
    const dir = await createProject("app", ["demo"]);
    await remove(removeOptions(dir, "demo"));
    expect(existsSync(join(dir, "src/features/demo/i18n"))).toBe(false);
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
    expect(existsSync(join(dir, "src/features/auth/module.ts"))).toBe(true);
  });

  it("projectDir i jego rodzic nigdy nie znikają nawet gdy moduł ma wszystkie pliki katalogu", async () => {
    const dir = await createProject("app", ["demo"]);
    const parent = dirname(dir);
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    const extra = "plik-w-korzeniu.txt";
    await writeProjectFile(dir, extra, "x\n");
    await writeKitState(dir, {
      ...state,
      modules: {
        ...state.modules,
        demo: {
          ...demo,
          files: { ...demo.files, [extra]: "dowolny-hash" },
        },
      },
    });
    await remove(removeOptions(dir, "demo", { force: true }));
    expect(existsSync(join(dir, extra))).toBe(false);
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(parent)).toBe(true);
    expect((await readdir(dir)).includes(".wa")).toBe(true);
  });

  it("ostatnia linia logu to polecenie migracji remove", async () => {
    const dir = await createProject("app", ["demo"]);
    await remove(removeOptions(dir, "demo"));
    expect(log.mock.calls.at(-1)).toEqual([
      "npx prisma migrate dev --name remove-demo",
    ]);
  });

  it("z install uruchamia npm install w katalogu projektu", async () => {
    const dir = await createProject("app", ["demo"]);
    await remove(removeOptions(dir, "demo", { install: true }));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("npm", ["install"], dir);
  });

  it("bez install nie uruchamia żadnego polecenia", async () => {
    const dir = await createProject("app", ["demo"]);
    await remove(removeOptions(dir, "demo"));
    expect(runner).not.toHaveBeenCalled();
  });

  it("katalog bez .wa/kit.json kończy się błędem", async () => {
    const dir = await createProject("app", ["demo"]);
    await rm(join(dir, ".wa"), { recursive: true });
    await expect(remove(removeOptions(dir, "demo"))).rejects.toThrow(
      "Brak .wa/kit.json",
    );
  });

  it("drugie wywołanie remove demo kończy się błędem niezainstalowanego modułu", async () => {
    const dir = await createProject("app", ["demo"]);
    await remove(removeOptions(dir, "demo"));
    await expect(remove(removeOptions(dir, "demo"))).rejects.toThrow(
      "Moduł demo nie jest zainstalowany",
    );
  });
});
