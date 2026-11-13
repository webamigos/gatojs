import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectFromTag,
  IGNORE,
  makeTaggedKit,
  makeTempDir,
  removeTempDirs,
  snapshotDir,
} from "../../__tests__/helpers.js";
import { cloneKitVersion } from "../../kit/source.js";
import { readKitState, writeKitState } from "../../manifest/kit-state.js";
import { spawnRunner } from "../../process/runner.js";
import type { Runner } from "../../process/runner.js";
import { assertCleanTree, checkVersions, update } from "../update.js";

const exec = promisify(execFile);

const RESOLVE_LINE =
  "Rozwiąż konflikty, potem: npm run wa -- generate && npm install";
const UNDO_LINE =
  "Cofnięcie całej aktualizacji: git restore . && git clean -fd";
const STALE_REGISTRY = "export const stale = true;\n";
const AUTH_MODULE = "src/features/auth/module.ts";
const PROJECT_CONFIG = "src/shared/config/project.ts";

let log: ReturnType<typeof vi.fn<(line: string) => void>>;
const runner = vi.fn<Runner>(async () => {});

beforeEach(() => {
  log = vi.fn<(line: string) => void>();
  runner.mockReset();
  runner.mockImplementation(async () => {});
});

afterEach(async () => {
  await removeTempDirs();
});

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function lines(): string[] {
  return log.mock.calls.map(([line]) => line);
}

async function put(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function editJson(
  root: string,
  path: string,
  edit: (json: Record<string, unknown>) => void,
): Promise<void> {
  const json = JSON.parse(await readFile(join(root, path), "utf8")) as Record<
    string,
    unknown
  >;
  edit(json);
  await writeFile(join(root, path), `${JSON.stringify(json, null, 2)}\n`);
}

async function commitAll(dir: string): Promise<void> {
  await exec("git", ["-C", dir, "add", "-A"]);
  await exec("git", ["-C", dir, "commit", "-q", "--no-verify", "-m", "zmiana"]);
}

async function cloneTag(kitDir: string, version: string): Promise<string> {
  return cloneKitVersion({
    source: kitDir,
    version,
    runner: spawnRunner,
    tmpDir: await makeTempDir("wa-kit-tag-"),
    name: "kit",
  });
}

type Setup = {
  dir: string;
  baseKitDir: string;
  targetKitDir: string;
};

async function prepare(input: {
  kit: (kitDir: string) => Promise<void>;
  modules?: string[];
  name?: string;
  project?: (dir: string) => Promise<void>;
}): Promise<Setup> {
  const kitDir = await makeTaggedKit(input.kit);
  const dir = await createProjectFromTag(
    kitDir,
    input.name ?? "app",
    input.modules ?? [],
  );
  if (input.project) {
    await input.project(dir);
    await commitAll(dir);
  }
  return {
    dir,
    baseKitDir: await cloneTag(kitDir, "0.1.0"),
    targetKitDir: await cloneTag(kitDir, "0.2.0"),
  };
}

function run(
  setup: Setup,
  overrides: Partial<{
    dryRun: boolean;
    install: boolean;
    version: string;
  }> = {},
) {
  return update({
    projectDir: setup.dir,
    version: overrides.version ?? "0.2.0",
    baseKitDir: setup.baseKitDir,
    targetKitDir: setup.targetKitDir,
    dryRun: overrides.dryRun ?? false,
    install: overrides.install ?? true,
    runner,
    log,
  });
}

async function read(dir: string, path: string): Promise<string> {
  return readFile(join(dir, path), "utf8");
}

type RawState = {
  kitVersion: string;
  modules: Record<
    string,
    {
      version: string;
      manifest: { version: string };
      files: Record<string, string>;
    }
  >;
  projectModules: Record<string, unknown>;
};

async function rawState(dir: string): Promise<RawState> {
  return JSON.parse(await read(dir, ".wa/kit.json")) as RawState;
}

const changeAuthModule = async (kitDir: string) => {
  await writeFile(
    join(kitDir, AUTH_MODULE),
    'export default { key: "auth", version: "v0.2.0" };\n',
  );
};

const prependKitVersionToConfig = async (kitDir: string) => {
  const path = join(kitDir, PROJECT_CONFIG);
  await writeFile(
    path,
    `export const kitVersion = "0.2.0";\n${await readFile(path, "utf8")}`,
  );
};

const staleRegistry = async (dir: string) => {
  await writeFile(join(dir, "src/modules.generated.ts"), STALE_REGISTRY);
};

const addLogLevelToEnvExample = async (kitDir: string) => {
  const path = join(kitDir, ".env.example");
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace(
      "ADMIN_EMAIL=\n",
      "ADMIN_EMAIL=\nLOG_LEVEL=info\n",
    ),
  );
};

describe("checkVersions", () => {
  it("ta sama wersja daje same", () => {
    expect(checkVersions("0.1.0", "0.1.0")).toBe("same");
  });

  it("wyższa wersja docelowa daje newer, także gdy porównanie tekstowe mówi inaczej", () => {
    expect(checkVersions("0.1.0", "0.2.0")).toBe("newer");
    expect(checkVersions("0.9.0", "0.10.0")).toBe("newer");
    expect(checkVersions("1.9.9", "2.0.0")).toBe("newer");
  });

  it("niższa wersja docelowa rzuca błąd o obniżaniu", () => {
    expect(() => checkVersions("0.10.0", "0.9.0")).toThrow(
      "Projekt ma wa-kit 0.10.0, nowszą niż 0.9.0; wa update nie obniża wersji",
    );
    expect(() => checkVersions("0.2.0", "0.1.0")).toThrow(
      "Projekt ma wa-kit 0.2.0, nowszą niż 0.1.0; wa update nie obniża wersji",
    );
  });
});

describe("assertCleanTree", () => {
  async function gitProject(): Promise<string> {
    const dir = await makeTempDir("wa-kit-clean-");
    await exec("git", ["-C", dir, "init", "-q"]);
    await exec("git", ["-C", dir, "config", "user.name", "Test"]);
    await exec("git", ["-C", dir, "config", "user.email", "test@example.com"]);
    await writeFile(join(dir, "a.txt"), "a\n");
    await writeFile(join(dir, ".gitignore"), "ignored.txt\n");
    await commitAll(dir);
    return dir;
  }

  it("czyste drzewo przechodzi, także z plikiem ignorowanym", async () => {
    const dir = await gitProject();
    await writeFile(join(dir, "ignored.txt"), "x\n");
    await expect(assertCleanTree(dir)).resolves.toBeUndefined();
  });

  it("zmieniony plik śledzony daje błąd brudnego drzewa", async () => {
    const dir = await gitProject();
    await writeFile(join(dir, "a.txt"), "b\n");
    await expect(assertCleanTree(dir)).rejects.toThrow(
      "Niezacommitowane zmiany w projekcie; zrób commit albo stash przed wa update",
    );
  });

  it("nieśledzony plik daje błąd brudnego drzewa", async () => {
    const dir = await gitProject();
    await writeFile(join(dir, "nowy.txt"), "n\n");
    await expect(assertCleanTree(dir)).rejects.toThrow(
      "Niezacommitowane zmiany w projekcie; zrób commit albo stash przed wa update",
    );
  });

  it("katalog bez repozytorium git daje błąd braku gita", async () => {
    const dir = await makeTempDir("wa-kit-nogit-");
    const failure = assertCleanTree(dir);
    await expect(failure).rejects.toThrow(
      `${dir} nie jest repozytorium git; wa update wymaga gita, żeby dało się cofnąć zmiany`,
    );
    await expect(failure).rejects.toMatchObject({
      cause: expect.any(Error),
    });
  });

  it("brak polecenia git w systemie daje błąd o instalacji gita, nie o repozytorium", async () => {
    const dir = await gitProject();
    const emptyBin = await makeTempDir("wa-kit-nopath-");
    const originalPath = process.env.PATH;
    process.env.PATH = emptyBin;
    try {
      const failure = assertCleanTree(dir);
      await expect(failure).rejects.toThrow(
        "Nie znaleziono polecenia git; zainstaluj git, żeby uruchomić wa update",
      );
      await expect(failure).rejects.toMatchObject({
        cause: expect.objectContaining({ code: "ENOENT" }),
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

describe("update: kit zmienił plik, projekt nie", () => {
  it("plik ma treść z v0.2.0, .wa/kit.json ma nową wersję, manifest i hash treści kitu, generate i npm install wołane", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await changeAuthModule(kitDir);
        await editJson(kitDir, "kit/modules/core.json", (json) => {
          json.version = "0.3.0";
        });
      },
      project: staleRegistry,
    });
    const before = await readKitState(setup.dir);

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(await read(setup.dir, AUTH_MODULE)).toBe(
      'export default { key: "auth", version: "v0.2.0" };\n',
    );
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  zaktualizowano src/features/auth/module.ts",
    ]);
    const state = await rawState(setup.dir);
    expect(state.kitVersion).toBe("0.2.0");
    expect(state.modules.core?.version).toBe("0.3.0");
    expect(state.modules.core?.manifest.version).toBe("0.3.0");
    expect(state.modules.core?.files[AUTH_MODULE]).toBe(
      sha256('export default { key: "auth", version: "v0.2.0" };\n'),
    );
    expect(state.modules.core?.files["package.json"]).toBe("managed");
    expect(state.modules.core?.files["src/i18n/config.ts"]).toBe(
      sha256('export type Locale = "pl" | "en";\n'),
    );
    const after = await readKitState(setup.dir);
    expect(after.kitRepo).toBe(before.kitRepo);
    expect(after.project).toEqual({ name: "App", slug: "app" });
    expect(after.locales).toEqual(["pl", "en"]);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("npm", ["install"], setup.dir);
    const registry = await read(setup.dir, "src/modules.generated.ts");
    expect(registry).not.toBe(STALE_REGISTRY);
    expect(registry).toContain(
      'import authModule from "@/features/auth/module";',
    );
  });

  it("bez install (--no-install) nie woła npm install, a plik i tak jest zaktualizowany", async () => {
    const setup = await prepare({ kit: changeAuthModule });

    expect(await run(setup, { install: false })).toEqual({ exitCode: 0 });

    expect(runner).not.toHaveBeenCalled();
    expect(await read(setup.dir, AUTH_MODULE)).toBe(
      'export default { key: "auth", version: "v0.2.0" };\n',
    );
    expect((await rawState(setup.dir)).kitVersion).toBe("0.2.0");
  });

  it("projectModules zostają bez zmian", async () => {
    const notes = {
      manifest: {
        name: "notes",
        version: "1.0.0",
        description: "moduł projektu",
        requires: [],
        files: ["src/features/notes/**"],
        dependencies: {},
        devDependencies: {},
        env: [],
        schemaRelations: [],
        compose: null,
        ciSteps: null,
        workspaces: [],
      },
    };
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        await put(
          dir,
          "src/features/notes/module.ts",
          'export default { key: "notes" };\n',
        );
        const state = await readKitState(dir);
        await writeKitState(dir, { ...state, projectModules: { notes } });
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    const state = await rawState(setup.dir);
    expect(state.projectModules).toEqual({ notes });
    expect(state.modules.notes).toBeUndefined();
  });

  it("drugie wywołanie po udanej aktualizacji mówi, że projekt ma już 0.2.0", async () => {
    const setup = await prepare({ kit: changeAuthModule });
    await run(setup);
    log.mockClear();
    runner.mockClear();

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(lines()).toEqual(["Projekt ma już wa-kit 0.2.0"]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("gdy kit nie zmienił żadnego pliku projektu, zapisuje .wa/kit.json z nową wersją", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await writeFile(
          join(kitDir, "docs/readme.md"),
          "# Nowa dokumentacja\n",
        );
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  bez zmian w plikach",
    ]);
    expect((await rawState(setup.dir)).kitVersion).toBe("0.2.0");
  });

  it("błąd npm install rzuca błąd z przyczyną, nie cofa zmian, a podpowiedzi są wypisane przed nim", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await changeAuthModule(kitDir);
        await writeFile(
          join(kitDir, "prisma/schema/auth.prisma"),
          "model User {\n  id String @id\n  email String\n  // wa:relations:start\n  // wa:relations:end\n}\n",
        );
      },
    });
    const installError = new Error("npm install zakończone kodem 1");
    runner.mockRejectedValue(installError);

    const failure = run(setup);
    await expect(failure).rejects.toThrow(
      "Zaktualizowano do wa-kit 0.2.0, ale npm install się nie powiódł. Uruchom: npm install",
    );
    await expect(failure).rejects.toMatchObject({ cause: installError });

    expect(lines()).toContain("npx prisma migrate dev --name kit-0.2.0");
    expect(await read(setup.dir, AUTH_MODULE)).toBe(
      'export default { key: "auth", version: "v0.2.0" };\n',
    );
    expect(await read(setup.dir, "prisma/schema/auth.prisma")).toBe(
      "model User {\n  id String @id\n  email String\n  // wa:relations:start\n  // wa:relations:end\n}\n",
    );
    expect((await rawState(setup.dir)).kitVersion).toBe("0.2.0");
  });

  it("błąd wa generate po zapisie rzuca błąd z przyczyną, nie cofa zmian i nie woła npm install", async () => {
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        const path = join(dir, ".env.example");
        await writeFile(
          path,
          (await readFile(path, "utf8")).replace("# wa:modules:end\n", ""),
        );
      },
    });
    const brokenEnv = await read(setup.dir, ".env.example");

    const failure = run(setup);
    await expect(failure).rejects.toThrow(
      "Zaktualizowano do wa-kit 0.2.0, ale wa generate się nie powiódł. Uruchom: npm run wa -- generate",
    );
    const error: unknown = await failure.catch((caught: unknown) => caught);
    expect((error as Error).cause).toMatchObject({
      message: ".env.example: uszkodzony region wa:modules",
    });

    expect(await read(setup.dir, AUTH_MODULE)).toBe(
      'export default { key: "auth", version: "v0.2.0" };\n',
    );
    expect(await read(setup.dir, ".env.example")).toBe(brokenEnv);
    const state = await rawState(setup.dir);
    expect(state.kitVersion).toBe("0.2.0");
    expect(state.modules.core?.files[AUTH_MODULE]).toBe(
      sha256('export default { key: "auth", version: "v0.2.0" };\n'),
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it("po aktualizacji package-lock.json ma w .wa/kit.json znacznik managed", async () => {
    const setup = await prepare({ kit: changeAuthModule });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(
      (await rawState(setup.dir)).modules.core?.files["package-lock.json"],
    ).toBe("managed");
  });

  it("kit docelowy w innej wersji niż żądana: błąd, projekt bez zmian", async () => {
    const setup = await prepare({ kit: changeAuthModule });
    const before = await snapshotDir(setup.dir, IGNORE);

    await expect(run(setup, { version: "0.3.0" })).rejects.toThrow(
      "Kit docelowy ma wersję 0.2.0, oczekiwano 0.3.0",
    );

    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
    expect(runner).not.toHaveBeenCalled();
  });

  it.skipIf(process.getuid?.() === 0)(
    "plik do aktualizacji bez prawa odczytu: błąd EACCES, projekt i .wa/kit.json bez zmian",
    async () => {
      const setup = await prepare({ kit: changeAuthModule });
      const before = await snapshotDir(setup.dir, IGNORE);
      await exec("git", [
        "-C",
        setup.dir,
        "update-index",
        "--assume-unchanged",
        AUTH_MODULE,
      ]);
      await chmod(join(setup.dir, AUTH_MODULE), 0o200);
      try {
        await expect(run(setup)).rejects.toThrow("EACCES");
      } finally {
        await chmod(join(setup.dir, AUTH_MODULE), 0o644);
      }

      expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
      expect(runner).not.toHaveBeenCalled();
    },
  );
});

describe("update: scalanie", () => {
  it("projekt i kit zmienili różne linie: obie zmiany w pliku, hash w .wa/kit.json z treści kitu, nie scalonej", async () => {
    const setup = await prepare({
      kit: prependKitVersionToConfig,
      project: async (dir) => {
        await writeFile(
          join(dir, PROJECT_CONFIG),
          'export const project = {\n  name: "App",\n  slug: "app",\n} as const;\nexport const local = true;\n',
        );
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(await read(setup.dir, PROJECT_CONFIG)).toBe(
      'export const kitVersion = "0.2.0";\nexport const project = {\n  name: "App",\n  slug: "app",\n} as const;\nexport const local = true;\n',
    );
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  scalono        src/shared/config/project.ts",
    ]);
    const state = await rawState(setup.dir);
    expect(state.kitVersion).toBe("0.2.0");
    expect(state.modules.core?.files[PROJECT_CONFIG]).toBe(
      sha256(
        'export const kitVersion = "0.2.0";\nexport const project = {\n  name: "App",\n  slug: "app",\n} as const;\n',
      ),
    );
    expect(runner).toHaveBeenCalledWith("npm", ["install"], setup.dir);
  });

  it("plik różny od tagu, ale zgodny z hashem w .wa/kit.json: linia Uwaga z liczbą plików", async () => {
    const local =
      'export const project = {\n  name: "App",\n  slug: "app",\n} as const;\nexport const local = true;\n';
    const setup = await prepare({
      kit: prependKitVersionToConfig,
      project: async (dir) => {
        await writeFile(join(dir, PROJECT_CONFIG), local);
        await editJson(dir, ".wa/kit.json", (json) => {
          const modules = json.modules as RawState["modules"];
          const core = modules.core as RawState["modules"][string];
          core.files[PROJECT_CONFIG] = sha256(local);
        });
      },
    });

    await run(setup);

    expect(lines()).toContain(
      "Uwaga: 1 plik różni się od v0.1.0 z tagu; potraktowano go jak zmieniony w projekcie",
    );
    expect(lines()).toContain("  scalono        src/shared/config/project.ts");
  });
});

describe("update: konflikty", () => {
  it("konflikt zostawia markery, zapisuje .wa/kit.json z 0.2.0, kończy kodem 1 i pomija generate oraz npm install", async () => {
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        await writeFile(
          join(dir, AUTH_MODULE),
          'export default { key: "auth", local: true };\n',
        );
        await staleRegistry(dir);
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 1 });

    expect(await read(setup.dir, AUTH_MODULE)).toBe(
      [
        "<<<<<<< projekt",
        'export default { key: "auth", local: true };',
        "||||||| v0.1.0",
        'export default { key: "auth" };',
        "=======",
        'export default { key: "auth", version: "v0.2.0" };',
        ">>>>>>> v0.2.0",
        "",
      ].join("\n"),
    );
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  konflikt       src/features/auth/module.ts",
      RESOLVE_LINE,
      UNDO_LINE,
    ]);
    const state = await rawState(setup.dir);
    expect(state.kitVersion).toBe("0.2.0");
    expect(state.modules.core?.files[AUTH_MODULE]).toBe(
      sha256('export default { key: "auth", version: "v0.2.0" };\n'),
    );
    expect(runner).not.toHaveBeenCalled();
    expect(await read(setup.dir, "src/modules.generated.ts")).toBe(
      STALE_REGISTRY,
    );
  });

  it("projekt i kit podbili zod: markery w package.json i bez npm install", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await editJson(kitDir, "kit/modules/core.json", (json) => {
          json.dependencies = { zod: "^4.5.0" };
        });
      },
      project: async (dir) => {
        await editJson(dir, "package.json", (json) => {
          json.dependencies = { zod: "^4.4.0" };
        });
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 1 });

    expect(await read(setup.dir, "package.json")).toBe(
      [
        "{",
        '  "name": "app",',
        '  "version": "0.1.0",',
        '  "private": true,',
        '  "scripts": {',
        '    "dev": "next dev"',
        "  },",
        '  "dependencies": {',
        "<<<<<<< projekt",
        '    "zod": "^4.4.0"',
        "||||||| v0.1.0",
        '    "zod": "^4.3.6"',
        "=======",
        '    "zod": "^4.5.0"',
        ">>>>>>> v0.2.0",
        "  },",
        '  "devDependencies": {}',
        "}",
        "",
      ].join("\n"),
    );
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  konflikt       package.json",
      RESOLVE_LINE,
      UNDO_LINE,
    ]);
    expect(runner).not.toHaveBeenCalled();
    expect(
      (await rawState(setup.dir)).modules.core?.files["package.json"],
    ).toBe("managed");
  });
});

describe("update: pliki dodane i usunięte w kicie", () => {
  it("nowy plik dodany z bitami z kitu, usunięty i niezmieniony znika razem z pustym katalogiem", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await put(
          kitDir,
          "src/shared/lib/rate-limit.sh",
          "#!/bin/sh\necho limit\n",
        );
        await chmod(join(kitDir, "src/shared/lib/rate-limit.sh"), 0o755);
        await rm(join(kitDir, AUTH_MODULE));
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(await read(setup.dir, "src/shared/lib/rate-limit.sh")).toBe(
      "#!/bin/sh\necho limit\n",
    );
    expect(
      (await stat(join(setup.dir, "src/shared/lib/rate-limit.sh"))).mode &
        0o777,
    ).toBe(0o755);
    expect(existsSync(join(setup.dir, AUTH_MODULE))).toBe(false);
    expect(existsSync(join(setup.dir, "src/features/auth"))).toBe(false);
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  dodano         src/shared/lib/rate-limit.sh",
      "  usunięto       src/features/auth/module.ts",
    ]);
    const files = (await rawState(setup.dir)).modules.core?.files ?? {};
    expect(files["src/shared/lib/rate-limit.sh"]).toBe(
      sha256("#!/bin/sh\necho limit\n"),
    );
    expect(AUTH_MODULE in files).toBe(false);
  });

  it("kit zmienił tylko bity uprawnień pliku rdzenia: plik w projekcie staje się wykonywalny", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await chmod(join(kitDir, AUTH_MODULE), 0o755);
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect((await stat(join(setup.dir, AUTH_MODULE))).mode & 0o777).toBe(0o755);
    expect(lines()).toContain("  zaktualizowano src/features/auth/module.ts");
  });

  it("usunięty w kicie, zmieniony w projekcie: plik zostaje, do decyzji, kod 1, generate i npm install wołane, brak wpisu w files", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await rm(join(kitDir, AUTH_MODULE));
      },
      project: async (dir) => {
        await writeFile(
          join(dir, AUTH_MODULE),
          'export default { key: "auth", local: true };\n',
        );
        await staleRegistry(dir);
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 1 });

    expect(await read(setup.dir, AUTH_MODULE)).toBe(
      'export default { key: "auth", local: true };\n',
    );
    expect(lines()[0]).toBe("Aktualizacja wa-kit 0.1.0 → 0.2.0");
    expect(lines()).toContain(
      "  do decyzji     src/features/auth/module.ts (zmieniony w projekcie, usunięty w kicie)",
    );
    expect(lines()).not.toContain(RESOLVE_LINE);
    expect(runner).toHaveBeenCalledWith("npm", ["install"], setup.dir);
    expect(await read(setup.dir, "src/modules.generated.ts")).not.toBe(
      STALE_REGISTRY,
    );
    const state = await rawState(setup.dir);
    expect(state.kitVersion).toBe("0.2.0");
    expect(AUTH_MODULE in (state.modules.core?.files ?? {})).toBe(false);
  });

  it("kolejność linii: kategorie w porządku akcji, w kategorii alfabetycznie", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await put(kitDir, "src/shared/lib/b.ts", "export const b = 1;\n");
        await put(kitDir, "src/shared/lib/a.ts", "export const a = 1;\n");
        await writeFile(
          join(kitDir, "src/i18n/config.ts"),
          'export type Locale = "pl";\n',
        );
        await changeAuthModule(kitDir);
        await rm(join(kitDir, ".wa/bin/wa.mjs"));
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  zaktualizowano src/features/auth/module.ts",
      "  zaktualizowano src/i18n/config.ts",
      "  dodano         src/shared/lib/a.ts",
      "  dodano         src/shared/lib/b.ts",
      "  usunięto       .wa/bin/wa.mjs",
    ]);
  });
});

describe("update: regiony i podpowiedzi", () => {
  it("kit zmienił .env.example poza regionem i dodał zmienne demo: region po generate ma nowe zmienne, linia z nowymi zmiennymi alfabetycznie", async () => {
    const setup = await prepare({
      modules: ["demo"],
      kit: async (kitDir) => {
        await addLogLevelToEnvExample(kitDir);
        await editJson(kitDir, "kit/modules/demo.json", (json) => {
          json.version = "0.4.0";
          json.env = [
            { name: "DEMO_TOKEN", example: "{{projectSlug}}_demo_" },
            { name: "DEMO_SECRET", example: "sekret" },
            { name: "ALPHA_KEY", example: "alfa" },
          ];
        });
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(await read(setup.dir, ".env.example")).toBe(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\nBETTER_AUTH_SECRET=change-me-to-a-random-string-of-at-least-32-chars\nADMIN_EMAIL=\nLOG_LEVEL=info\n\n# wa:modules:start\n# demo\nDEMO_TOKEN=app_demo_\nDEMO_SECRET=sekret\nALPHA_KEY=alfa\n# wa:modules:end\n",
    );
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  zaktualizowano .env.example",
      "Nowe zmienne w .env.example: ALPHA_KEY, DEMO_SECRET; uzupełnij .env",
    ]);
    const state = await rawState(setup.dir);
    expect(state.modules.demo?.version).toBe("0.4.0");
    expect(state.modules.core?.files[".env.example"]).toBe(
      sha256(
        "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\nBETTER_AUTH_SECRET=change-me-to-a-random-string-of-at-least-32-chars\nADMIN_EMAIL=\nLOG_LEVEL=info\n\n# wa:modules:start\n# wa:modules:end\n",
      ),
    );
  });

  it("region zmieniony tylko w projekcie i zmiana kitu poza regionem: bez konfliktu, region odtworzony przez generate", async () => {
    const setup = await prepare({
      modules: ["demo"],
      kit: addLogLevelToEnvExample,
      project: async (dir) => {
        const path = join(dir, ".env.example");
        await writeFile(
          path,
          (await readFile(path, "utf8")).replace(
            "DEMO_TOKEN=app_demo_",
            "DEMO_TOKEN=moj_token",
          ),
        );
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(await read(setup.dir, ".env.example")).toBe(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\nBETTER_AUTH_SECRET=change-me-to-a-random-string-of-at-least-32-chars\nADMIN_EMAIL=\nLOG_LEVEL=info\n\n# wa:modules:start\n# demo\nDEMO_TOKEN=app_demo_\n# wa:modules:end\n",
    );
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  zaktualizowano .env.example",
    ]);
    expect(runner).toHaveBeenCalledWith("npm", ["install"], setup.dir);
  });

  it("kit zmienił prisma/schema/auth.prisma: linia z prisma migrate", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await writeFile(
          join(kitDir, "prisma/schema/auth.prisma"),
          "model User {\n  id String @id\n  email String\n  // wa:relations:start\n  // wa:relations:end\n}\n",
        );
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(await read(setup.dir, "prisma/schema/auth.prisma")).toBe(
      "model User {\n  id String @id\n  email String\n  // wa:relations:start\n  // wa:relations:end\n}\n",
    );
    expect(lines()).toEqual([
      "Aktualizacja wa-kit 0.1.0 → 0.2.0",
      "  zaktualizowano prisma/schema/auth.prisma",
      "npx prisma migrate dev --name kit-0.2.0",
    ]);
  });
});

describe("update --dry-run", () => {
  it("brudne drzewo z konfliktem: nagłówek planu, linie pozycji, kod 0, projekt bajt w bajt bez zmian", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await changeAuthModule(kitDir);
        await put(kitDir, "src/shared/lib/a.ts", "export const a = 1;\n");
      },
    });
    await writeFile(
      join(setup.dir, AUTH_MODULE),
      'export default { key: "auth", local: true };\n',
    );
    await writeFile(join(setup.dir, "notatki.txt"), "brudno\n");
    const before = await snapshotDir(setup.dir, IGNORE);

    expect(await run(setup, { dryRun: true })).toEqual({ exitCode: 0 });

    expect(lines()).toEqual([
      "Plan aktualizacji wa-kit 0.1.0 → 0.2.0 (bez zmian w projekcie)",
      "  dodano         src/shared/lib/a.ts",
      "  konflikt       src/features/auth/module.ts",
    ]);
    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("update: kontrole przed zapisem", () => {
  it("brudne drzewo bez --dry-run: błąd, projekt bez zmian, npm install niewołany", async () => {
    const setup = await prepare({ kit: changeAuthModule });
    await writeFile(join(setup.dir, "notatki.txt"), "brudno\n");
    const before = await snapshotDir(setup.dir, IGNORE);

    await expect(run(setup)).rejects.toThrow(
      "Niezacommitowane zmiany w projekcie; zrób commit albo stash przed wa update",
    );

    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
    expect(runner).not.toHaveBeenCalled();
  });

  it("projekt bez .git: błąd braku gita, projekt bez zmian", async () => {
    const setup = await prepare({ kit: changeAuthModule });
    await rm(join(setup.dir, ".git"), { recursive: true, force: true });
    const before = await snapshotDir(setup.dir, IGNORE);

    const failure = run(setup);
    await expect(failure).rejects.toThrow(
      `${setup.dir} nie jest repozytorium git; wa update wymaga gita, żeby dało się cofnąć zmiany`,
    );
    await expect(failure).rejects.toMatchObject({
      cause: expect.any(Error),
    });

    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
  });

  it("wersja równa: komunikat, kod 0, nic nie zapisane, nawet na brudnym drzewie", async () => {
    const setup = await prepare({ kit: changeAuthModule });
    await writeFile(join(setup.dir, "notatki.txt"), "brudno\n");
    const before = await snapshotDir(setup.dir, IGNORE);

    expect(
      await run(
        { ...setup, targetKitDir: setup.baseKitDir },
        { version: "0.1.0" },
      ),
    ).toEqual({ exitCode: 0 });

    expect(lines()).toEqual(["Projekt ma już wa-kit 0.1.0"]);
    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
    expect(runner).not.toHaveBeenCalled();
  });

  it("wersja niższa: błąd o obniżaniu, projekt bez zmian", async () => {
    const setup = await prepare({ kit: changeAuthModule });
    const before = await snapshotDir(setup.dir, IGNORE);

    await expect(
      run({ ...setup, targetKitDir: setup.baseKitDir }, { version: "0.0.9" }),
    ).rejects.toThrow(
      "Projekt ma wa-kit 0.1.0, nowszą niż 0.0.9; wa update nie obniża wersji",
    );

    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
  });

  it("moduł usunięty w v0.2.0: błąd, projekt bez zmian", async () => {
    const setup = await prepare({
      modules: ["demo"],
      kit: async (kitDir) => {
        await changeAuthModule(kitDir);
        await rm(join(kitDir, "kit/modules/demo.json"));
        await rm(join(kitDir, "kit/modules/needs-demo.json"));
      },
    });
    const before = await snapshotDir(setup.dir, IGNORE);

    await expect(run(setup)).rejects.toThrow(
      "Moduł demo nie istnieje w wa-kit 0.2.0",
    );

    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
    expect(runner).not.toHaveBeenCalled();
  });

  it("needs-demo w v0.2.0 wymaga niezainstalowanych modułów: błąd z listą, projekt bez zmian", async () => {
    const setup = await prepare({
      modules: ["needs-demo"],
      kit: async (kitDir) => {
        await changeAuthModule(kitDir);
        for (const name of ["extra", "zeta"]) {
          await put(
            kitDir,
            ["src/features", name, "module.ts"].join("/"),
            `export default { key: "${name}" };\n`,
          );
          const manifest = {
            name,
            version: "0.1.0",
            description: name,
            files: [["src/features", name, "**"].join("/")],
          };
          await writeFile(
            join(kitDir, "kit/modules", `${name}.json`),
            `${JSON.stringify(manifest, null, 2)}\n`,
          );
        }
        await editJson(kitDir, "kit/modules/needs-demo.json", (json) => {
          json.version = "0.5.0";
          json.requires = ["zeta", "demo", "extra"];
        });
      },
    });
    const before = await snapshotDir(setup.dir, IGNORE);

    await expect(run(setup)).rejects.toThrow(
      "Moduł needs-demo w wa-kit 0.2.0 wymaga niezainstalowanych modułów: extra, zeta",
    );

    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
    expect(runner).not.toHaveBeenCalled();
  });

  it("src/shared jako symlink do katalogu poza projektem: błąd ścieżki, nic nie zapisane w projekcie ani poza nim", async () => {
    const outside = await makeTempDir("wa-kit-outside-");
    const setup = await prepare({
      kit: async (kitDir) => {
        await changeAuthModule(kitDir);
        await prependKitVersionToConfig(kitDir);
      },
      project: async (dir) => {
        await cp(join(dir, "src/shared"), outside, { recursive: true });
        await rm(join(dir, "src/shared"), { recursive: true });
        await symlink(outside, join(dir, "src/shared"));
      },
    });
    const outsideBefore = await snapshotDir(outside, IGNORE);
    const before = await snapshotDir(setup.dir, [...IGNORE, "shared"]);

    await expect(run(setup)).rejects.toThrow(/^Ścieżka poza projektem: /);

    expect(await snapshotDir(outside, IGNORE)).toEqual(outsideBefore);
    expect(await snapshotDir(setup.dir, [...IGNORE, "shared"])).toEqual(before);
    expect(runner).not.toHaveBeenCalled();
  });

  it(".wa/kit.json jako symlink do pliku poza projektem: błąd ścieżki, plik zewnętrzny i plik rdzenia bez zmian", async () => {
    const outside = join(await makeTempDir("wa-kit-outside-"), "kit.json");
    let outsideBefore = "";
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        outsideBefore = await read(dir, ".wa/kit.json");
        await writeFile(outside, outsideBefore);
        await rm(join(dir, ".wa/kit.json"));
        await symlink(outside, join(dir, ".wa/kit.json"));
      },
    });
    const authBefore = await read(setup.dir, AUTH_MODULE);

    await expect(run(setup)).rejects.toThrow(
      "Ścieżka poza projektem: .wa/kit.json",
    );

    expect(await readFile(outside, "utf8")).toBe(outsideBefore);
    expect(await read(setup.dir, AUTH_MODULE)).toBe(authBefore);
    expect(runner).not.toHaveBeenCalled();
  });

  it("src/modules.generated.ts jako symlink do pliku poza projektem: błąd ścieżki, plik zewnętrzny bez zmian", async () => {
    const outside = join(
      await makeTempDir("wa-kit-outside-"),
      "modules.generated.ts",
    );
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        await writeFile(outside, STALE_REGISTRY);
        await rm(join(dir, "src/modules.generated.ts"));
        await symlink(outside, join(dir, "src/modules.generated.ts"));
      },
    });
    const authBefore = await read(setup.dir, AUTH_MODULE);

    await expect(run(setup)).rejects.toThrow(
      "Ścieżka poza projektem: src/modules.generated.ts",
    );

    expect(await readFile(outside, "utf8")).toBe(STALE_REGISTRY);
    expect(await read(setup.dir, AUTH_MODULE)).toBe(authBefore);
    expect(runner).not.toHaveBeenCalled();
  });

  it("docker-compose.yml z regionem jako symlink do pliku poza projektem, kit go nie zmienia: błąd ścieżki, plik zewnętrzny bez zmian", async () => {
    const outside = join(
      await makeTempDir("wa-kit-outside-"),
      "docker-compose.yml",
    );
    let outsideBefore = "";
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        outsideBefore = await read(dir, "docker-compose.yml");
        await writeFile(outside, outsideBefore);
        await rm(join(dir, "docker-compose.yml"));
        await symlink(outside, join(dir, "docker-compose.yml"));
      },
    });
    const authBefore = await read(setup.dir, AUTH_MODULE);

    await expect(run(setup)).rejects.toThrow(
      "Ścieżka poza projektem: docker-compose.yml",
    );

    expect(await readFile(outside, "utf8")).toBe(outsideBefore);
    expect(await read(setup.dir, AUTH_MODULE)).toBe(authBefore);
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("update: wpisy files w .wa/kit.json po aktualizacji", () => {
  it("files rdzenia to dokładnie pliki rdzenia z v0.2.0 oraz package.json i package-lock.json jako managed, bez pliku usuniętego w kicie", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await rm(join(kitDir, "src/i18n/config.ts"));
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    const files = (await rawState(setup.dir)).modules.core?.files ?? {};
    expect(Object.keys(files).sort()).toEqual([
      ".env.example",
      ".wa/bin/wa.mjs",
      "docker-compose.yml",
      "package-lock.json",
      "package.json",
      "prisma/schema/auth.prisma",
      "prisma/schema/organizations.prisma",
      "src/features/auth/module.ts",
      "src/shared/config/project.ts",
    ]);
    expect(files["package.json"]).toBe("managed");
    expect(files["package-lock.json"]).toBe("managed");
  });

  it("managedFiles w v0.2.0 bez package-lock.json: files rdzenia nie mają klucza package-lock.json", async () => {
    const setup = await prepare({
      kit: async (kitDir) => {
        await changeAuthModule(kitDir);
        await editJson(kitDir, "kit/kit.json", (json) => {
          json.managedFiles = ["package.json"];
        });
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    const files = (await rawState(setup.dir)).modules.core?.files ?? {};
    expect("package-lock.json" in files).toBe(false);
    expect(files["package.json"]).toBe("managed");
  });

  it("package-lock.json z ręcznym hashem zamiast managed w .wa/kit.json projektu: po aktualizacji brak wpisu", async () => {
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        await editJson(dir, ".wa/kit.json", (json) => {
          const modules = json.modules as RawState["modules"];
          const core = modules.core;
          if (core) core.files["package-lock.json"] = sha256("lock\n");
        });
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    const files = (await rawState(setup.dir)).modules.core?.files ?? {};
    expect("package-lock.json" in files).toBe(false);
    expect(files["package.json"]).toBe("managed");
  });

  it("usunięty w projekcie, zmieniony w kicie: plik nie wraca, do decyzji, kod 1, brak wpisu w files", async () => {
    const setup = await prepare({
      kit: changeAuthModule,
      project: async (dir) => {
        await rm(join(dir, AUTH_MODULE));
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 1 });

    expect(existsSync(join(setup.dir, AUTH_MODULE))).toBe(false);
    expect(lines()).toContain(
      "  do decyzji     src/features/auth/module.ts (usunięty w projekcie, zmieniony w kicie)",
    );
    const state = await rawState(setup.dir);
    expect(state.kitVersion).toBe("0.2.0");
    expect(AUTH_MODULE in (state.modules.core?.files ?? {})).toBe(false);
  });
});

describe("update: moduły i placeholdery", () => {
  it("needs-demo w v0.2.0 wymaga zainstalowanego demo: aktualizacja przechodzi, plik needs-demo ma treść kitu", async () => {
    const updated =
      'export default { key: "needs-demo", version: "v0.2.0" };\n';
    const setup = await prepare({
      modules: ["demo", "needs-demo"],
      kit: async (kitDir) => {
        await writeFile(
          join(kitDir, "src/features/needs-demo/module.ts"),
          updated,
        );
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect(await read(setup.dir, "src/features/needs-demo/module.ts")).toBe(
      updated,
    );
    expect(
      (await rawState(setup.dir)).modules["needs-demo"]?.files[
        "src/features/needs-demo/module.ts"
      ],
    ).toBe(sha256(updated));
  });

  it("projekt my-app, kit zmienił linię z wa_app w .env.example: nowa linia ma my_app", async () => {
    const setup = await prepare({
      name: "my-app",
      kit: async (kitDir) => {
        const path = join(kitDir, ".env.example");
        await writeFile(
          path,
          (await readFile(path, "utf8")).replace(
            "localhost:5432/wa_app",
            "localhost:5433/wa_app",
          ),
        );
      },
    });

    expect(await run(setup)).toEqual({ exitCode: 0 });

    expect((await read(setup.dir, ".env.example")).split("\n")[0]).toBe(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/my_app",
    );
  });
});
