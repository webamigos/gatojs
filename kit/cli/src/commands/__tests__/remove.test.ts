import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  IGNORE,
  makeTempDir,
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

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function setDemoFiles(
  dir: string,
  files: Record<string, string>,
): Promise<void> {
  const state = await readKitState(dir);
  const demo = state.modules.demo as NonNullable<
    (typeof state.modules)["demo"]
  >;
  await writeKitState(dir, {
    ...state,
    modules: { ...state.modules, demo: { ...demo, files } },
  });
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

  describe("ścieżki spoza projektu", () => {
    const victimContent = "ofiara\n";

    async function victimOutside(): Promise<string> {
      const outside = await makeTempDir("wa-kit-outside-");
      const victim = join(outside, "outside.txt");
      await writeFile(victim, victimContent);
      return victim;
    }

    it.each(["../outside.txt", "a/../../outside.txt", "..", ".", "ABSOLUTE"])(
      "wpis files %s odrzuca remove bez zmian w projekcie, także z --force",
      async (entry) => {
        for (const force of [false, true]) {
          const dir = await createProject("app", ["demo"]);
          const victim = await victimOutside();
          const outsideDir = dirname(victim);
          await writeFile(join(dirname(dir), "outside.txt"), victimContent);
          const file = entry === "ABSOLUTE" ? victim : entry;
          await setDemoFiles(dir, { [file]: sha256(victimContent) });
          const snapshot = await snapshotDir(dir, IGNORE);
          await expect(
            remove(removeOptions(dir, "demo", { force })),
          ).rejects.toThrow(`Ścieżka poza projektem: ${file}`);
          expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
          expect(await readFile(victim, "utf8")).toBe(victimContent);
          expect(
            await readFile(join(dirname(dir), "outside.txt"), "utf8"),
          ).toBe(victimContent);
          expect(existsSync(outsideDir)).toBe(true);
          expect(runner).not.toHaveBeenCalled();
        }
      },
    );

    it("plik w katalogu o nazwie zaczynającej się od .. jest w projekcie i zostaje usunięty", async () => {
      const dir = await createProject("app", ["demo"]);
      await writeProjectFile(dir, "..foo/a.txt", "x\n");
      await setDemoFiles(dir, { "..foo/a.txt": sha256("x\n") });
      await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
        removed: ["demo"],
      });
      expect(existsSync(join(dir, "..foo/a.txt"))).toBe(false);
      expect(existsSync(join(dir, "..foo"))).toBe(false);
    });

    it.each([false, true])(
      "symlink prowadzący poza projekt jest odrzucany, plik-ofiara zostaje (force=%s)",
      async (force) => {
        const dir = await createProject("app", ["demo"]);
        const outside = await makeTempDir("wa-kit-outside-");
        await writeFile(join(outside, "victim.txt"), victimContent);
        await symlink(outside, join(dir, "src/features/demo/link"));
        await setDemoFiles(dir, {
          "src/features/demo/link/victim.txt": sha256(victimContent),
        });
        const ignore = [...IGNORE, "link"];
        const snapshot = await snapshotDir(dir, ignore);
        await expect(
          remove(removeOptions(dir, "demo", { force })),
        ).rejects.toThrow(
          "Ścieżka poza projektem: src/features/demo/link/victim.txt",
        );
        expect(await readFile(join(outside, "victim.txt"), "utf8")).toBe(
          victimContent,
        );
        expect(
          (await lstat(join(dir, "src/features/demo/link"))).isSymbolicLink(),
        ).toBe(true);
        expect(await snapshotDir(dir, ignore)).toEqual(snapshot);
        expect(runner).not.toHaveBeenCalled();
      },
    );
  });

  it("zmienione pliki zapisane w stanie odwrotnie do alfabetycznej są wypisane alfabetycznie", async () => {
    const dir = await createProject("app", ["demo"]);
    await writeProjectFile(dir, "src/features/demo/zz.ts", "zmiana\n");
    await writeProjectFile(dir, "src/features/demo/aa.ts", "zmiana\n");
    await setDemoFiles(dir, {
      "src/features/demo/zz.ts": sha256("stare\n"),
      "src/features/demo/aa.ts": sha256("stare\n"),
    });
    await expect(remove(removeOptions(dir, "demo"))).rejects.toMatchObject({
      message:
        "Zmienione pliki modułu demo (użyj --force):\n  src/features/demo/aa.ts\n  src/features/demo/zz.ts",
    });
  });

  it("błąd odczytu inny niż brak pliku (katalog w files) przerywa remove bez usuwania", async () => {
    const dir = await createProject("app", ["demo"]);
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await setDemoFiles(dir, {
      ...demo.files,
      "src/features/demo/i18n": sha256("x"),
    });
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(
      remove(removeOptions(dir, "demo", { force: true })),
    ).rejects.toThrow("EISDIR");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
  });

  it("dwa pliki w jednym podkatalogu znikają razem z pustymi katalogami", async () => {
    const dir = await createProject("app", ["demo"]);
    await writeProjectFile(dir, "src/features/demo/sub/a.ts", "a\n");
    await writeProjectFile(dir, "src/features/demo/sub/b.ts", "b\n");
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await setDemoFiles(dir, {
      ...demo.files,
      "src/features/demo/sub/a.ts": sha256("a\n"),
      "src/features/demo/sub/b.ts": sha256("b\n"),
    });
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
    expect(existsSync(join(dir, "src/features/demo/sub"))).toBe(false);
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
  });

  it("błąd npm install zgłasza komunikat, a moduł jest już usunięty ze stanu i z dysku", async () => {
    const dir = await createProject("app", ["demo"]);
    runner.mockRejectedValueOnce(new Error("npm padł"));
    await expect(
      remove(removeOptions(dir, "demo", { install: true })),
    ).rejects.toThrow(
      "Moduł usunięty, ale npm install się nie powiódł. Uruchom: npm install",
    );
    expect(Object.keys((await readKitState(dir)).modules)).toEqual(["core"]);
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
  });

  it("plik modułu w brakujących katalogach nie blokuje remove i nie zostawia śladów", async () => {
    const dir = await createProject("app", ["demo"]);
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await setDemoFiles(dir, {
      ...demo.files,
      "src/features/demo/deep/a/b/missing.ts": sha256("dowolny"),
    });
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
    expect(existsSync(dir)).toBe(true);
    expect(Object.keys((await readKitState(dir)).modules)).toEqual(["core"]);
  });

  it("brakujący plik w brakujących katalogach tuż pod korzeniem projektu nie blokuje remove", async () => {
    const dir = await createProject("app", ["demo"]);
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await setDemoFiles(dir, {
      ...demo.files,
      "nieistnieje/a/b/plik.ts": sha256("dowolny"),
    });
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
    expect(existsSync(join(dir, "nieistnieje"))).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });

  it("brakujące katalogi nie ukrywają ucieczki poza projekt przez ..", async () => {
    const dir = await createProject("app", ["demo"]);
    const entry = "src/features/demo/deep/../../../../../outside-x.txt";
    await setDemoFiles(dir, { [entry]: sha256("x") });
    const snapshot = await snapshotDir(dir, IGNORE);
    await expect(remove(removeOptions(dir, "demo"))).rejects.toThrow(
      `Ścieżka poza projektem: ${entry}`,
    );
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
  });

  it("symlink do katalogu wewnątrz projektu nie przerywa remove i nie jest usuwany przy sprzątaniu", async () => {
    const dir = await createProject("app", ["demo"]);
    await writeProjectFile(dir, "src/features/demo/real/f.ts", "f\n");
    await symlink("real", join(dir, "src/features/demo/inner"));
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await setDemoFiles(dir, {
      ...demo.files,
      "src/features/demo/inner/f.ts": sha256("f\n"),
    });
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
    expect(existsSync(join(dir, "src/features/demo/real/f.ts"))).toBe(false);
    expect(existsSync(join(dir, "src/features/demo/module.ts"))).toBe(false);
    expect(
      (await lstat(join(dir, "src/features/demo/inner"))).isSymbolicLink(),
    ).toBe(true);
  });

  it("dwa brakujące poziomy katalogów pod korzeniem projektu nie blokują remove", async () => {
    const dir = await createProject("app", ["demo"]);
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await setDemoFiles(dir, {
      ...demo.files,
      "nieistnieje-a/nieistnieje-b/plik.ts": sha256("dowolny"),
    });
    await expect(remove(removeOptions(dir, "demo"))).resolves.toEqual({
      removed: ["demo"],
    });
  });

  it("wpis files pod zwykłym plikiem kończy się błędem ENOTDIR, nie sukcesem ani odrzuceniem jako poza projektem", async () => {
    const dir = await createProject("app", ["demo"]);
    const state = await readKitState(dir);
    const demo = state.modules.demo as NonNullable<
      (typeof state.modules)["demo"]
    >;
    await setDemoFiles(dir, {
      ...demo.files,
      "src/features/demo/module.ts/x": sha256("x"),
    });
    const snapshot = await snapshotDir(dir, IGNORE);
    const failure = await remove(removeOptions(dir, "demo")).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toContain("ENOTDIR: not a directory, realpath");
    expect(failure?.message).not.toContain("Ścieżka poza projektem");
    expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
    expect(runner).not.toHaveBeenCalled();
  });

  it.each([
    ["zawiera niepoprawny JSON", "niepoprawny"],
    ["nie istnieje", "brak"],
  ])(
    "package.json, który %s, przerywa remove przed usunięciem czegokolwiek",
    async (_nazwa, wariant) => {
      const dir = await createProject("app", ["demo"]);
      if (wariant === "niepoprawny") {
        await writeFile(join(dir, "package.json"), "{nie json");
      } else {
        await rm(join(dir, "package.json"));
      }
      const snapshot = await snapshotDir(dir, IGNORE);
      const failure = await remove(removeOptions(dir, "demo")).then(
        () => null,
        (error: Error) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(await snapshotDir(dir, IGNORE)).toEqual(snapshot);
      expect(existsSync(join(dir, "src/features/demo/module.ts"))).toBe(true);
      expect(existsSync(join(dir, "src/features/demo/env.ts"))).toBe(true);
      expect(existsSync(join(dir, "src/features/demo/i18n/pl.json"))).toBe(
        true,
      );
      expect(Object.keys((await readKitState(dir)).modules)).toEqual([
        "core",
        "demo",
      ]);
      expect(runner).not.toHaveBeenCalled();
    },
  );
});
