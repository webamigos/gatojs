import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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

const runCommand = promisify(execFile);

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
    ).rejects.toThrow("Module demo is already installed");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
  });

  it("add core kończy się błędem, bo core is already installed", async () => {
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
    ).rejects.toThrow("Module core is already installed");
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
            selfhostCompose: null,
            ciSteps: null,
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
      "Module demo is a project module; rename it or remove its projectModules entry",
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
      "Files already exist; stopped without changes:\n  src/features/demo/module.ts",
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
      "Files already exist; stopped without changes:\n  src/features/demo/env.ts\n  src/features/demo/module.ts",
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
      "Files already exist; stopped without changes:\n  src/features/demo/module.ts\n  src/features/needs-demo/module.ts",
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
    ).rejects.toThrow("Files already exist");
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
      packageBefore,
    );
    expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(stateBefore);
    expect(runner).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")(
    "wiszący symlink na ścieżce modułu jest kolizją i zostaje nietknięty",
    async () => {
      const dir = await createProject("app", []);
      await mkdir(join(dir, "src/features/demo"), { recursive: true });
      await symlink("nowhere", join(dir, "src/features/demo/module.ts"));
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
      ).rejects.toThrow(
        "Files already exist; stopped without changes:\n  src/features/demo/module.ts",
      );
      expect(await readlink(join(dir, "src/features/demo/module.ts"))).toBe(
        "nowhere",
      );
      expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
        packageBefore,
      );
      expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(
        stateBefore,
      );
      expect(runner).not.toHaveBeenCalled();
    },
  );

  it.skipIf(process.platform === "win32")(
    "symlink do istniejącego pliku na ścieżce modułu jest kolizją",
    async () => {
      const dir = await createProject("app", []);
      await writeProjectFile(dir, "elsewhere.ts", "export default 7;\n");
      await mkdir(join(dir, "src/features/demo"), { recursive: true });
      await symlink(
        join(dir, "elsewhere.ts"),
        join(dir, "src/features/demo/module.ts"),
      );
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
        "Files already exist; stopped without changes:\n  src/features/demo/module.ts",
      );
      expect(await readFile(join(dir, "elsewhere.ts"), "utf8")).toBe(
        "export default 7;\n",
      );
      expect(runner).not.toHaveBeenCalled();
    },
  );

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "błąd lstat inny niż brak pliku jest rzucony, a projekt zostaje bez zmian",
    async () => {
      const dir = await createProject("app", []);
      await mkdir(join(dir, "src/features/demo"), { recursive: true });
      const packageBefore = await readFile(join(dir, "package.json"), "utf8");
      const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
      await chmod(join(dir, "src/features/demo"), 0o000);
      try {
        await expect(
          add({
            projectDir: dir,
            module: "demo",
            kitDir,
            install: false,
            runner,
            log,
          }),
        ).rejects.toMatchObject({ code: "EACCES" });
      } finally {
        await chmod(join(dir, "src/features/demo"), 0o755);
      }
      expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
        packageBefore,
      );
      expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(
        stateBefore,
      );
      expect(log).not.toHaveBeenCalled();
    },
  );

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
    ).rejects.toThrow("Module added, but npm install failed. Run: npm install");
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
    ).rejects.toThrow("No .wa/kit.json");
  });
});

describe("add na zmodyfikowanej kopii kitu", () => {
  it("projectSnake z projektu my-app zastępuje wa_app w pliku modułu jako my_app", async () => {
    const kitCopy = await makeKitRepo("kit");
    await writeFile(
      join(kitCopy, "src/features/demo/module.ts"),
      "export const prefix = 'wa_app';\n",
    );
    const kitJsonPath = join(kitCopy, "kit/kit.json");
    const kitJson = JSON.parse(await readFile(kitJsonPath, "utf8"));
    kitJson.placeholderFiles.push("src/features/demo/module.ts");
    await writeFile(kitJsonPath, JSON.stringify(kitJson, null, 2));
    await runCommand("git", ["-C", kitCopy, "add", "-A"]);
    const dir = await createProject("my-app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    });
    expect(
      await readFile(join(dir, "src/features/demo/module.ts"), "utf8"),
    ).toBe("export const prefix = 'my_app';\n");
  });

  it("kolizje są wypisane alfabetycznie, także gdy zależność alpha wymaga zeta", async () => {
    const kitCopy = await makeKitRepo("kit");
    await writeFile(
      join(kitCopy, "kit/modules/alpha.json"),
      JSON.stringify({
        name: "alpha",
        version: "1.0.0",
        description: "alpha",
        requires: ["zeta"],
        files: ["src/features/alpha/**"],
      }),
    );
    await writeFile(
      join(kitCopy, "kit/modules/zeta.json"),
      JSON.stringify({
        name: "zeta",
        version: "1.0.0",
        description: "zeta",
        files: ["src/features/zeta/**"],
      }),
    );
    await writeProjectFile(kitCopy, "src/features/alpha/module.ts", "a\n");
    await writeProjectFile(kitCopy, "src/features/zeta/module.ts", "z\n");
    await runCommand("git", ["-C", kitCopy, "add", "-A"]);
    const dir = await createProject("app", []);
    await writeProjectFile(dir, "src/features/alpha/module.ts", "x\n");
    await writeProjectFile(dir, "src/features/zeta/module.ts", "y\n");
    await expect(
      add({
        projectDir: dir,
        module: "alpha",
        kitDir: kitCopy,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow(
      "Files already exist; stopped without changes:\n  src/features/alpha/module.ts\n  src/features/zeta/module.ts",
    );
  });

  it("kolizje są posortowane po ścieżce, gdy kolejność modułów daje ścieżki nieposortowane", async () => {
    const kitCopy = await makeKitRepo("kit");
    await writeFile(
      join(kitCopy, "kit/modules/alpha.json"),
      JSON.stringify({
        name: "alpha",
        version: "1.0.0",
        description: "alpha",
        requires: ["beta"],
        files: ["src/features/zzz-alpha/**"],
      }),
    );
    await writeFile(
      join(kitCopy, "kit/modules/beta.json"),
      JSON.stringify({
        name: "beta",
        version: "1.0.0",
        description: "beta",
        files: ["src/features/aaa-beta/**"],
      }),
    );
    await writeProjectFile(kitCopy, "src/features/zzz-alpha/module.ts", "a\n");
    await writeProjectFile(kitCopy, "src/features/aaa-beta/module.ts", "b\n");
    await runCommand("git", ["-C", kitCopy, "add", "-A"]);
    const dir = await createProject("app", []);
    await writeProjectFile(dir, "src/features/zzz-alpha/module.ts", "x\n");
    await writeProjectFile(dir, "src/features/aaa-beta/module.ts", "y\n");
    const before = await snapshotDir(dir, IGNORE);
    await expect(
      add({
        projectDir: dir,
        module: "alpha",
        kitDir: kitCopy,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow(
      "Files already exist; stopped without changes:\n  src/features/aaa-beta/module.ts\n  src/features/zzz-alpha/module.ts",
    );
    expect(await snapshotDir(dir, IGNORE)).toEqual(before);
  });
});

describe("addFromSource", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await makeTempDir();
  });

  function cloneFromKit(): Runner {
    return vi.fn<Runner>(async (command, args) => {
      if (command === "git" && args.includes("clone")) {
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
    ).rejects.toThrow("Module core is already installed");
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
    expect(cloneArgs.slice(0, 10)).toEqual([
      "-c",
      "advice.detachedHead=false",
      "clone",
      "--depth",
      "1",
      "--branch",
      "v0.1.0",
      "--quiet",
      "--",
      "https://example.com/org/wa-kit.git",
    ]);
    expect(cloneArgs[10]?.startsWith(`${tmpRoot}/`)).toBe(true);
    expect(cloneArgs[10]?.endsWith("/wa-kit")).toBe(true);
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("katalog tymczasowy leży wewnątrz tmpRoot i nie zostawia wpisów obok niego", async () => {
    const dir = await createProject("app", []);
    const parent = dirname(tmpRoot);
    const prefix = basename(tmpRoot);
    await addFromSource({
      projectDir: dir,
      module: "demo",
      kitFlag: "https://example.com/org/wa-kit.git",
      envSource: undefined,
      install: false,
      runner: cloneFromKit(),
      log,
      tmpRoot,
    });
    const siblings = (await readdir(parent)).filter(
      (name) => name.startsWith(prefix) && name !== prefix,
    );
    expect(siblings).toEqual([]);
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
    ).rejects.toThrow("Check access (gh auth status) or pass --kit <path>");
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
    ).rejects.toThrow("has version 0.1.0, the project uses 9.9.9");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(await readdir(tmpRoot)).toEqual([]);
  });
});

async function addModuleToKit(
  kitCopy: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const name = manifest["name"] as string;
  await writeFile(
    join(kitCopy, `kit/modules/${name}.json`),
    JSON.stringify({
      version: "1.0.0",
      description: name,
      files: [`src/features/${name}/**`],
      ...manifest,
    }),
  );
  await writeProjectFile(
    kitCopy,
    `src/features/${name}/module.ts`,
    `export default { key: "${name}" };\n`,
  );
  await runCommand("git", ["-C", kitCopy, "add", "-A"]);
}

async function setProjectDependencies(
  dir: string,
  sections: Record<string, Record<string, string>>,
): Promise<void> {
  const packagePath = join(dir, "package.json");
  const parsed = JSON.parse(await readFile(packagePath, "utf8"));
  for (const [section, dependencies] of Object.entries(sections)) {
    parsed[section] = { ...parsed[section], ...dependencies };
  }
  await writeFile(packagePath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function cleanupWarnings(): string[] {
  return log.mock.calls
    .map(([line]) => line)
    .filter((line) => line.includes("Could not clean up"));
}

function warnings(): string[] {
  return log.mock.calls
    .map(([line]) => line)
    .filter((line) => line.startsWith("Warning:"));
}

describe("add: ostrzeżenie o innej wersji zależności", () => {
  it("projekt ma zod ^3, moduł wymaga ^4: ostrzega, a package.json zostaje przy ^3", async () => {
    const kitCopy = await makeKitRepo("kit");
    await addModuleToKit(kitCopy, {
      name: "zodder",
      dependencies: { zod: "^4" },
    });
    const dir = await createProject("app", []);
    await setProjectDependencies(dir, { dependencies: { zod: "^3" } });
    await add({
      projectDir: dir,
      module: "zodder",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    });
    expect(warnings()).toEqual([
      "Warning: zod (dependencies) is ^3 in the project, module zodder requires ^4; keeping the project version",
    ]);
    const after = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(after.dependencies["zod"]).toBe("^3");
  });

  it("ostrzeżenie pojawia się przed ostatnią linią z migracją", async () => {
    const kitCopy = await makeKitRepo("kit");
    await addModuleToKit(kitCopy, {
      name: "zodder",
      dependencies: { zod: "^4" },
    });
    const dir = await createProject("app", []);
    await setProjectDependencies(dir, { dependencies: { zod: "^3" } });
    await add({
      projectDir: dir,
      module: "zodder",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    });
    expect(log.mock.calls.at(-1)).toEqual([
      "npx prisma migrate dev --name add-zodder",
    ]);
    expect(
      log.mock.calls.findIndex(([line]) => line.startsWith("Warning:")),
    ).toBeGreaterThanOrEqual(0);
  });

  it("ta sama wersja nie daje ostrzeżenia", async () => {
    const kitCopy = await makeKitRepo("kit");
    await addModuleToKit(kitCopy, {
      name: "zodder",
      dependencies: { zod: "^4" },
    });
    const dir = await createProject("app", []);
    await setProjectDependencies(dir, { dependencies: { zod: "^4" } });
    await add({
      projectDir: dir,
      module: "zodder",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    });
    expect(warnings()).toEqual([]);
  });

  it("brak zależności w projekcie: bez ostrzeżenia, zależność dopisana", async () => {
    const dir = await createProject("app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    expect(warnings()).toEqual([]);
    const after = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(after.dependencies["left-pad"]).toBe("^1.3.0");
  });

  it("zależność projektu w devDependencies, moduł w dependencies: bez ostrzeżenia, dopisana do dependencies", async () => {
    const dir = await createProject("app", []);
    await setProjectDependencies(dir, {
      devDependencies: { "left-pad": "^1.0.0" },
    });
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    expect(warnings()).toEqual([]);
    const after = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(after.dependencies["left-pad"]).toBe("^1.3.0");
    expect(after.devDependencies["left-pad"]).toBe("^1.0.0");
  });

  it("zależność projektu w dependencies, moduł w devDependencies: bez ostrzeżenia", async () => {
    const kitCopy = await makeKitRepo("kit");
    await addModuleToKit(kitCopy, {
      name: "tooling",
      devDependencies: { zod: "^3" },
    });
    const dir = await createProject("app", []);
    await add({
      projectDir: dir,
      module: "tooling",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    });
    expect(warnings()).toEqual([]);
  });

  it("kilka konfliktów jest wypisanych po sekcji, potem po nazwie, z nazwą sekcji", async () => {
    const kitCopy = await makeKitRepo("kit");
    await addModuleToKit(kitCopy, {
      name: "multi",
      dependencies: { zeta: "^2", alpha: "^2" },
      devDependencies: { tsx: "^4.0.0" },
    });
    const dir = await createProject("app", []);
    await setProjectDependencies(dir, {
      dependencies: { zeta: "^1", alpha: "^1" },
      devDependencies: { tsx: "^3.0.0" },
    });
    await add({
      projectDir: dir,
      module: "multi",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    });
    expect(warnings()).toEqual([
      "Warning: alpha (dependencies) is ^1 in the project, module multi requires ^2; keeping the project version",
      "Warning: zeta (dependencies) is ^1 in the project, module multi requires ^2; keeping the project version",
      "Warning: tsx (devDependencies) is ^3.0.0 in the project, module multi requires ^4.0.0; keeping the project version",
    ]);
  });

  it("przy kilku modułach porównuje z package.json po dodaniu poprzednich", async () => {
    const kitCopy = await makeKitRepo("kit");
    await addModuleToKit(kitCopy, {
      name: "base",
      dependencies: { foo: "^1" },
    });
    await addModuleToKit(kitCopy, {
      name: "extra",
      requires: ["base"],
      dependencies: { foo: "^2" },
    });
    const dir = await createProject("app", []);
    const result = await add({
      projectDir: dir,
      module: "extra",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    });
    expect(result.added).toEqual(["base", "extra"]);
    expect(warnings()).toEqual([
      "Warning: foo (dependencies) is ^1 in the project, module extra requires ^2; keeping the project version",
    ]);
    const after = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(after.dependencies["foo"]).toBe("^1");
  });
});

const DEMO_FILES = [
  "src/features/demo/compose.yml",
  "src/features/demo/env.ts",
  "src/features/demo/i18n/pl.json",
  "src/features/demo/module.ts",
];

describe("add: sprzątanie po błędzie I/O", () => {
  async function kitWithMissingFile(relative: string): Promise<string> {
    const kitCopy = await makeKitRepo("kit");
    await rm(join(kitCopy, relative));
    return kitCopy;
  }

  async function expectCleanFailure(
    dir: string,
    kitCopy: string,
    module: string,
  ): Promise<void> {
    const snapshot = await snapshotDir(dir, IGNORE);
    const packageBefore = await readFile(join(dir, "package.json"), "utf8");
    const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
    const featuresBefore = await readdir(join(dir, "src/features"));
    const error = await add({
      projectDir: dir,
      module,
      kitDir: kitCopy,
      install: true,
      runner,
      log,
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: "ENOENT" });
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
      packageBefore,
    );
    expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(stateBefore);
    expect(await readdir(join(dir, "src/features"))).toEqual(featuresBefore);
    expect(runner).not.toHaveBeenCalled();
    expect(cleanupWarnings()).toEqual([]);
  }

  it("brakujący na dysku drugi plik modułu: ENOENT, żaden plik ani katalog modułu nie zostaje", async () => {
    const kitCopy = await kitWithMissingFile("src/features/demo/env.ts");
    const dir = await createProject("app", []);
    await expectCleanFailure(dir, kitCopy, "demo");
    for (const file of DEMO_FILES) {
      expect(existsSync(join(dir, file))).toBe(false);
    }
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
  });

  it("błąd po utworzeniu podkatalogu usuwa też podkatalog i katalog modułu", async () => {
    const kitCopy = await kitWithMissingFile("src/features/demo/module.ts");
    const dir = await createProject("app", []);
    await expectCleanFailure(dir, kitCopy, "demo");
    for (const file of DEMO_FILES) {
      expect(existsSync(join(dir, file))).toBe(false);
    }
    expect(existsSync(join(dir, "src/features/demo/i18n"))).toBe(false);
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
  });

  it("katalog istniejący przed add zostaje, nowe podkatalogi znikają", async () => {
    const kitCopy = await kitWithMissingFile("src/features/demo/module.ts");
    const dir = await createProject("app", []);
    await mkdir(join(dir, "src/features/demo"), { recursive: true });
    await expectCleanFailure(dir, kitCopy, "demo");
    expect(existsSync(join(dir, "src/features/demo"))).toBe(true);
    expect(await readdir(join(dir, "src/features/demo"))).toEqual([]);
  });

  it("istniejący wcześniej plik spoza modułu w katalogu modułu zostaje", async () => {
    const kitCopy = await kitWithMissingFile("src/features/demo/module.ts");
    const dir = await createProject("app", []);
    await writeProjectFile(dir, "src/features/demo/notes.txt", "moje\n");
    await expectCleanFailure(dir, kitCopy, "demo");
    expect(
      await readFile(join(dir, "src/features/demo/notes.txt"), "utf8"),
    ).toBe("moje\n");
    expect(await readdir(join(dir, "src/features/demo"))).toEqual([
      "notes.txt",
    ]);
  });

  it("błąd w drugim module usuwa także pliki pierwszego", async () => {
    const kitCopy = await kitWithMissingFile(
      "src/features/needs-demo/module.ts",
    );
    const dir = await createProject("app", []);
    await expectCleanFailure(dir, kitCopy, "needs-demo");
    for (const file of DEMO_FILES) {
      expect(existsSync(join(dir, file))).toBe(false);
    }
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
    expect(existsSync(join(dir, "src/features/needs-demo"))).toBe(false);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "błąd w zapisie .wa/kit.json przywraca package.json i usuwa pliki modułu, rzucając oryginalny błąd",
    async () => {
      const dir = await createProject("app", []);
      const packageBefore = await readFile(join(dir, "package.json"), "utf8");
      const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
      const snapshot = await snapshotDir(dir, IGNORE);
      await chmod(join(dir, ".wa/kit.json"), 0o444);
      let error: unknown = null;
      try {
        await add({
          projectDir: dir,
          module: "demo",
          kitDir,
          install: true,
          runner,
          log,
        }).catch((caught: unknown) => {
          error = caught;
        });
      } finally {
        await chmod(join(dir, ".wa/kit.json"), 0o644);
      }
      expect(error).toMatchObject({ code: "EACCES" });
      expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
        packageBefore,
      );
      expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(
        stateBefore,
      );
      expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
      expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
      expect(runner).not.toHaveBeenCalled();
      expect(cleanupWarnings()).toEqual([]);
    },
  );

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "package.json tylko do odczytu: EACCES, nic nie zostaje, brak ostrzeżeń o sprzątaniu",
    async () => {
      const dir = await createProject("app", []);
      const packageBefore = await readFile(join(dir, "package.json"), "utf8");
      const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
      const snapshot = await snapshotDir(dir, IGNORE);
      await chmod(join(dir, "package.json"), 0o444);
      let error: unknown = null;
      try {
        await add({
          projectDir: dir,
          module: "demo",
          kitDir,
          install: true,
          runner,
          log,
        }).catch((caught: unknown) => {
          error = caught;
        });
      } finally {
        await chmod(join(dir, "package.json"), 0o644);
      }
      expect(error).toMatchObject({ code: "EACCES" });
      expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
        packageBefore,
      );
      expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(
        stateBefore,
      );
      expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
      expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
      expect(cleanupWarnings()).toEqual([]);
      expect(runner).not.toHaveBeenCalled();
    },
  );
});

describe("add: plik w miejscu katalogu modułu", () => {
  it("zwykły plik zamiast i18n: EEXIST, plik zostaje, reszta modułu znika, brak linii sprzątania", async () => {
    const dir = await createProject("app", []);
    await writeProjectFile(dir, "src/features/demo/i18n", "to jest plik\n");
    const packageBefore = await readFile(join(dir, "package.json"), "utf8");
    const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
    const error = await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: true,
      runner,
      log,
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: "EEXIST" });
    expect(await readFile(join(dir, "src/features/demo/i18n"), "utf8")).toBe(
      "to jest plik\n",
    );
    expect(await readdir(join(dir, "src/features/demo"))).toEqual(["i18n"]);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
      packageBefore,
    );
    expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(stateBefore);
    expect(runner).not.toHaveBeenCalled();
    expect(cleanupWarnings()).toEqual([]);
  });
});

const EJECTED_BLOCK =
  '  "ejected": {\n    "src/a.ts": {\n      "reason": "custom login",\n      "ejectedAt": "2026-11-23"\n    }\n  }\n}\n';

async function ejectLoginFile(dir: string): Promise<void> {
  const path = join(dir, ".wa/kit.json");
  const json = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  json.ejected = {
    "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
  };
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`);
}

describe("add: ejected files", () => {
  it("keeps an ejected entry byte for byte after add demo", async () => {
    const dir = await createProject("app", []);
    await ejectLoginFile(dir);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    const raw = await readFile(join(dir, ".wa/kit.json"), "utf8");
    expect(raw.endsWith(EJECTED_BLOCK)).toBe(true);
    expect(Object.keys(JSON.parse(raw).modules)).toEqual(["core", "demo"]);
  });

  it("keeps kitFormat 2 of the project after add demo", async () => {
    const dir = await createProject("app", []);
    await add({
      projectDir: dir,
      module: "demo",
      kitDir,
      install: false,
      runner,
      log,
    });
    expect(
      JSON.parse(await readFile(join(dir, ".wa/kit.json"), "utf8")).kitFormat,
    ).toBe(2);
  });
});
