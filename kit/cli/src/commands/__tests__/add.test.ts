import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  IGNORE,
  makeKitRepo,
  makeTempDir,
  removeTempDirs,
  snapshotDir,
} from "../../__tests__/helpers.js";
import { readKitState, writeKitState } from "../../manifest/kit-state.js";
import type { Runner } from "../../process/runner.js";
import { add, addFromSource } from "../add.js";

let kitDir: string;
let runner: ReturnType<typeof vi.fn<Runner>>;
let log: ReturnType<typeof vi.fn<(line: string) => void>>;

beforeEach(async () => {
  kitDir = await makeKitRepo("kit");
  runner = vi.fn<Runner>(async () => {});
  log = vi.fn<(line: string) => void>();
});

afterEach(async () => {
  await removeTempDirs();
});

async function writeProjectFile(
  dir: string,
  relative: string,
  content: string,
): Promise<void> {
  await mkdir(join(dir, relative, ".."), { recursive: true });
  await writeFile(join(dir, relative), content);
}

describe("add", () => {
  it("core + add demo daje to samo co create --modules demo", async () => {
    const viaAdd = await createProject("my-app", []);
    await add({
      projectDir: viaAdd,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    const viaCreate = await createProject("my-app", ["demo"], "other");
    expect(await snapshotDir(viaAdd, IGNORE)).toEqual(
      await snapshotDir(viaCreate, IGNORE),
    );
  });

  it("core + add needs-demo daje to samo co create --modules needs-demo", async () => {
    const viaAdd = await createProject("my-app", []);
    await add({
      projectDir: viaAdd,
      module: "needs-demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    const viaCreate = await createProject("my-app", ["needs-demo"], "other");
    expect(await snapshotDir(viaAdd, IGNORE)).toEqual(
      await snapshotDir(viaCreate, IGNORE),
    );
  });

  it("add demo zapisuje wersję modułu w .wa/kit.json", async () => {
    const dir = await createProject("my-app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    const { modules } = await readKitState(dir);
    expect(Object.keys(modules)).toEqual(["core", "demo"]);
    expect(modules["demo"]?.version).toBe("0.3.0");
    expect(Object.keys(modules["demo"]?.files ?? {})).toContain(
      "src/features/demo/module.ts",
    );
  });

  it("add needs-demo w projekcie z samym core dodaje demo i needs-demo", async () => {
    const dir = await createProject("app", []);
    const result = await add({
      projectDir: dir,
      module: "needs-demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    expect(result.added).toEqual(["demo", "needs-demo"]);
  });

  it("add needs-demo w projekcie z demo dodaje tylko needs-demo i nie rusza plików demo", async () => {
    const dir = await createProject("app", ["demo"]);
    await writeProjectFile(
      dir,
      "src/features/demo/module.ts",
      "export default 42;\n",
    );
    const result = await add({
      projectDir: dir,
      module: "needs-demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    expect(result.added).toEqual(["needs-demo"]);
    expect(
      await readFile(join(dir, "src/features/demo/module.ts"), "utf8"),
    ).toBe("export default 42;\n");
  });

  it("drugie add demo kończy się błędem i nie zmienia projektu", async () => {
    const dir = await createProject("app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: true,
        runner,
        log,
      }),
    ).rejects.toThrow("Moduł demo jest już zainstalowany");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
  });

  it("add core kończy się błędem, bo core jest już zainstalowany", async () => {
    const dir = await createProject("app", []);
    await expect(
      add({
        projectDir: dir,
        module: "core",
        kitDir,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow("Moduł core jest już zainstalowany");
  });

  it("add demo przy wpisie demo w projectModules kończy się błędem i nie zmienia projektu", async () => {
    const dir = await createProject("app", []);
    const state = await readKitState(dir);
    await writeKitState(dir, {
      ...state,
      projectModules: {
        demo: {
          manifest: {
            name: "demo",
            version: "1.0.0",
            description: "moduł projektu",
            requires: [],
            files: ["src/features/demo/**"],
            dependencies: {},
            devDependencies: {},
            env: [],
            schemaRelations: [],
            compose: null,
            workspaces: [],
          },
        },
      },
    });
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: true,
        runner,
        log,
      }),
    ).rejects.toThrow(
      "Moduł demo jest modułem projektu; zmień jego nazwę albo usuń wpis z projectModules",
    );
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
  });

  it("istniejący plik docelowy przerywa add bez zmian w projekcie", async () => {
    const dir = await createProject("app", []);
    await writeProjectFile(
      dir,
      "src/features/demo/module.ts",
      "export default 1;\n",
    );
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow(
      "Pliki już istnieją, przerwano bez zmian:\n  src/features/demo/module.ts",
    );
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(Object.keys((await readKitState(dir)).modules)).toEqual(["core"]);
  });

  it("dwa istniejące pliki docelowe są zgłoszone w dwóch liniach, bez plików niekolidujących", async () => {
    const dir = await createProject("app", []);
    await writeProjectFile(
      dir,
      "src/features/demo/module.ts",
      "export default 1;\n",
    );
    await writeProjectFile(
      dir,
      "src/features/demo/env.ts",
      "export default 2;\n",
    );
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow(
      "Pliki już istnieją, przerwano bez zmian:\n  src/features/demo/env.ts\n  src/features/demo/module.ts",
    );
    const error = await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    }).catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain("compose.yml");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
  });

  it("kolizje w plikach różnych dodawanych modułów są zgłoszone razem", async () => {
    const dir = await createProject("app", []);
    await writeProjectFile(
      dir,
      "src/features/demo/module.ts",
      "export default 1;\n",
    );
    await writeProjectFile(
      dir,
      "src/features/needs-demo/module.ts",
      "export default 2;\n",
    );
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      add({
        projectDir: dir,
        module: "needs-demo",
        kitDir,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow(
      "Pliki już istnieją, przerwano bez zmian:\n  src/features/demo/module.ts\n  src/features/needs-demo/module.ts",
    );
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
  });

  it("kolizja przerywa add przed zapisem package.json i stanu", async () => {
    const dir = await createProject("app", []);
    await writeProjectFile(
      dir,
      "src/features/demo/module.ts",
      "export default 1;\n",
    );
    const packageBefore = await readFile(join(dir, "package.json"), "utf8");
    const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: true,
        runner,
        log,
      }),
    ).rejects.toThrow("Pliki już istnieją");
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
      packageBefore,
    );
    expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(stateBefore);
    expect(runner).not.toHaveBeenCalled();
  });

  it("package.json po add demo ma left-pad, a ręcznie dodana zależność zostaje", async () => {
    const dir = await createProject("app", []);
    const packagePath = join(dir, "package.json");
    const manifest = JSON.parse(await readFile(packagePath, "utf8"));
    manifest.dependencies["is-odd"] = "^3.0.1";
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    const after = JSON.parse(await readFile(packagePath, "utf8"));
    expect(after.dependencies["left-pad"]).toBe("^1.3.0");
    expect(after.dependencies["is-odd"]).toBe("^3.0.1");
    expect(after.dependencies["zod"]).toBe("^4.3.6");
  });

  it("ostatnia linia logu to npx prisma migrate dev --name add-demo", async () => {
    const dir = await createProject("app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    expect(log.mock.calls.at(-1)).toEqual([
      "npx prisma migrate dev --name add-demo",
    ]);
  });

  it("z install true woła npm install w katalogu projektu i na końcu loguje migrację", async () => {
    const dir = await createProject("app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: true,
      runner,
      log,
    });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("npm", ["install"], dir);
    expect(log.mock.calls.at(-1)).toEqual([
      "npx prisma migrate dev --name add-demo",
    ]);
  });

  it("z install false nie woła żadnego polecenia", async () => {
    const dir = await createProject("app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("npm install pada: komunikat Uruchom: npm install, a .wa/kit.json zawiera demo", async () => {
    const dir = await createProject("app", []);
    runner.mockRejectedValueOnce(new Error("x"));
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: true,
        runner,
        log,
      }),
    ).rejects.toThrow(
      "Moduł dodany, ale npm install się nie powiódł. Uruchom: npm install",
    );
    expect(Object.keys((await readKitState(dir)).modules)).toContain("demo");
    expect(log).not.toHaveBeenCalledWith(
      "npx prisma migrate dev --name add-demo",
    );
  });

  it("nieistniejący moduł kończy się błędem i nie zmienia projektu", async () => {
    const dir = await createProject("app", []);
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      add({
        projectDir: dir,
        module: "nie-ma-takiego",
        kitDir,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow();
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
  });

  it("katalog bez .wa/kit.json nie jest projektem wa-kit", async () => {
    const dir = await makeTempDir();
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow("Brak .wa/kit.json");
  });
});

describe("addFromSource", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await makeTempDir();
  });

  function cloneFromKit(): Runner {
    return vi.fn<Runner>(async (command, args) => {
      if (command === "git" && args[0] === "clone") {
        await cp(kitDir, args[args.length - 1] as string, { recursive: true });
      }
    });
  }

  it("lokalne --kit dodaje moduł i nie zostawia katalogu tymczasowego", async () => {
    const dir = await createProject("app", []);
    const result = await addFromSource({
      projectDir: dir,
      module: "demo",
      kitFlag: kitDir,
      envSource: undefined,
      install: false,
      runner,
      log,
      tmpRoot,
    });
    expect(result.added).toEqual(["demo"]);
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("katalog tymczasowy znika także po błędzie add", async () => {
    const dir = await createProject("app", []);
    await expect(
      addFromSource({
        projectDir: dir,
        module: "core",
        kitFlag: kitDir,
        envSource: undefined,
        install: false,
        runner,
        log,
        tmpRoot,
      }),
    ).rejects.toThrow("Moduł core jest już zainstalowany");
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("klonowanie z URL trafia do katalogu tymczasowego, add działa na klonie, a po wszystkim katalog znika", async () => {
    const dir = await createProject("app", []);
    const cloning = cloneFromKit();
    const result = await addFromSource({
      projectDir: dir,
      module: "demo",
      kitFlag: "https://example.com/org/wa-kit.git",
      envSource: undefined,
      install: false,
      runner: cloning,
      log,
      tmpRoot,
    });
    expect(result.added).toEqual(["demo"]);
    const cloneArgs = vi.mocked(cloning).mock.calls[0]?.[1] ?? [];
    expect(cloneArgs.slice(0, 7)).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      "v0.1.0",
      "--quiet",
      "https://example.com/org/wa-kit.git",
    ]);
    expect(cloneArgs[7]?.startsWith(tmpRoot)).toBe(true);
    expect(cloneArgs[7]?.endsWith("/wa-kit")).toBe(true);
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("katalog tymczasowy znika po nieudanym klonowaniu, a błąd ma podpowiedź", async () => {
    const dir = await createProject("app", []);
    runner.mockRejectedValueOnce(new Error("fatal"));
    await expect(
      addFromSource({
        projectDir: dir,
        module: "demo",
        kitFlag: "git@github.com:webamigos/wa-kit.git",
        envSource: undefined,
        install: false,
        runner,
        log,
        tmpRoot,
      }),
    ).rejects.toThrow(
      "Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>",
    );
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("WA_KIT_SOURCE jest używane, gdy nie podano --kit", async () => {
    const dir = await createProject("app", []);
    const result = await addFromSource({
      projectDir: dir,
      module: "demo",
      kitFlag: null,
      envSource: kitDir,
      install: false,
      runner,
      log,
      tmpRoot,
    });
    expect(result.added).toEqual(["demo"]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("niezgodna wersja lokalnego kitu kończy się błędem, projekt bez zmian, katalog tymczasowy usunięty", async () => {
    const dir = await createProject("app", []);
    const state = await readKitState(dir);
    await writeKitState(dir, { ...state, kitVersion: "9.9.9" });
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      addFromSource({
        projectDir: dir,
        module: "demo",
        kitFlag: kitDir,
        envSource: undefined,
        install: false,
        runner,
        log,
        tmpRoot,
      }),
    ).rejects.toThrow("ma wersję 0.1.0, projekt używa 9.9.9");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(await readdir(tmpRoot)).toEqual([]);
  });
});
