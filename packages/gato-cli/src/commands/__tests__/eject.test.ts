import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeKitRepo,
  makeTempDir,
  removeTempDirs,
} from "../../__tests__/helpers.js";
import { readKitState, writeKitState } from "../../manifest/kit-state.js";
import type { KitState, ModuleManifest } from "../../manifest/schema.js";
import { create } from "../create.js";
import { eject, undoEject } from "../eject.js";

const FIXTURE_KIT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/fixtures/kit",
);
const AUTH_MODULE = "src/features/auth/module.ts";
const AUTH_MODULE_CONTENT = 'export default { key: "auth" };\n';
const SLOW = 60_000;

let log: ReturnType<typeof vi.fn<(line: string) => void>>;

beforeEach(() => {
  log = vi.fn<(line: string) => void>();
});

afterEach(async () => {
  await removeTempDirs();
});

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function manifest(name: string, files: string[]): ModuleManifest {
  return {
    name,
    version: "1.0.0",
    description: name,
    requires: [],
    files,
    dependencies: {},
    devDependencies: {},
    env: [],
    schemaRelations: [],
    compose: null,
    ciSteps: null,
    workspaces: [],
  };
}

function stateWith(ejected: KitState["ejected"] = {}): KitState {
  return {
    kitVersion: "0.1.0",
    kitRepo: "https://github.com/webamigos/wa-kit.git",
    kitFormat: 2,
    project: { name: "App", slug: "app" },
    locales: ["pl", "en"],
    modules: {
      core: {
        version: "0.1.0",
        manifest: manifest("core", ["src/**", "package.json", "README.md"]),
        files: {
          "src/a.ts": sha256("x"),
          "src/b.ts": sha256("b"),
          "src/modules.generated.ts": sha256("generated"),
          "package.json": "managed",
          "README.md": "seed",
        },
      },
    },
    projectModules: {
      notes: { manifest: manifest("notes", ["src/features/notes/**"]) },
    },
    ejected,
  };
}

async function writeProjectFile(
  dir: string,
  relative: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content);
}

async function makeProject(ejected: KitState["ejected"] = {}): Promise<string> {
  const parent = await makeTempDir();
  const dir = join(parent, "app");
  await writeKitState(dir, stateWith(ejected));
  await writeProjectFile(dir, "src/a.ts", "y");
  await writeProjectFile(dir, "src/b.ts", "b");
  await writeProjectFile(dir, "src/features/notes/module.ts", "notes");
  return dir;
}

async function rawState(dir: string): Promise<string> {
  return readFile(join(dir, ".wa/kit.json"), "utf8");
}

async function ejectedOf(dir: string): Promise<unknown> {
  return (JSON.parse(await rawState(dir)) as { ejected: unknown }).ejected;
}

const NOV_23 = () => new Date("2026-11-23T12:00:00Z");

function ejectOptions(dir: string, file: string, reason: string) {
  return { projectDir: dir, file, reason, now: NOV_23, log };
}

describe("eject", () => {
  it("records the reason and the UTC date of the ejected Gato file", async () => {
    const dir = await makeProject();
    await eject(ejectOptions(dir, "src/a.ts", "custom login"));
    expect(await ejectedOf(dir)).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
    });
  });

  it("writes ejectedAt as a date without the time", async () => {
    const dir = await makeProject();
    await eject(ejectOptions(dir, "src/a.ts", "custom login"));
    const raw = await rawState(dir);
    expect(raw).toContain('"ejectedAt": "2026-11-23"');
    expect(raw).not.toContain("T12:00");
  });

  it("takes the date in UTC, not in local time", async () => {
    const dir = await makeProject();
    await eject({
      ...ejectOptions(dir, "src/a.ts", "custom login"),
      now: () => new Date("2026-11-23T23:30:00-05:00"),
    });
    expect(await ejectedOf(dir)).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-24" },
    });
  });

  it("trims the reason", async () => {
    const dir = await makeProject();
    await eject(ejectOptions(dir, "src/a.ts", "  custom login \n"));
    expect(await ejectedOf(dir)).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
    });
  });

  it("normalises ./src/a.ts to src/a.ts", async () => {
    const dir = await makeProject();
    await eject(ejectOptions(dir, "./src/a.ts", "custom login"));
    expect(await ejectedOf(dir)).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
    });
  });

  it("accepts an absolute path inside the project", async () => {
    const dir = await makeProject();
    await eject(ejectOptions(dir, join(dir, "src/a.ts"), "custom login"));
    expect(await ejectedOf(dir)).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
    });
  });

  it("keeps other ejected entries and the rest of the state", async () => {
    const dir = await makeProject({
      "src/b.ts": { reason: "custom b", ejectedAt: "2026-01-02" },
    });
    await eject(ejectOptions(dir, "src/a.ts", "custom login"));
    const state = await readKitState(dir);
    expect(state.ejected).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
      "src/b.ts": { reason: "custom b", ejectedAt: "2026-01-02" },
    });
    expect(state.modules).toEqual(stateWith().modules);
    expect(state.projectModules).toEqual(stateWith().projectModules);
  });

  it("leaves the ejected file content untouched", async () => {
    const dir = await makeProject();
    await eject(ejectOptions(dir, "src/a.ts", "custom login"));
    expect(await readFile(join(dir, "src/a.ts"), "utf8")).toBe("y");
  });

  it("logs that wa update will merge the file", async () => {
    const dir = await makeProject();
    await eject(ejectOptions(dir, "src/a.ts", "custom login"));
    expect(log).toHaveBeenCalledWith(
      "Ejected src/a.ts; wa update will merge it instead of replacing it",
    );
  });

  it.each([
    [
      "a path outside the project",
      "../x.ts",
      "custom",
      "Path outside the project: ../x.ts",
    ],
    [
      "an absolute path outside the project",
      "/etc/hosts",
      "custom",
      "Path outside the project: /etc/hosts",
    ],
    [
      "src/modules.generated.ts",
      "src/modules.generated.ts",
      "x",
      "src/modules.generated.ts is generated; change the manifest or module files and run npm run wa -- generate",
    ],
    [
      "src/modules.client.generated.ts",
      "src/modules.client.generated.ts",
      "x",
      "src/modules.client.generated.ts is generated; change the manifest or module files and run npm run wa -- generate",
    ],
    [
      "src/i18n/locales.generated.ts",
      "src/i18n/locales.generated.ts",
      "x",
      "src/i18n/locales.generated.ts is generated; change the manifest or module files and run npm run wa -- generate",
    ],
    [
      "a managed file",
      "package.json",
      "x",
      "package.json is managed by GatoJS (wa update merges it); it needs no eject",
    ],
    [
      "a seed file",
      "README.md",
      "x",
      "README.md is a seed file owned by the project; it needs no eject",
    ],
    [
      "a project module file",
      "src/features/notes/module.ts",
      "x",
      "src/features/notes/module.ts is a project file; it needs no eject",
    ],
    [
      "a path without a recorded hash",
      "src/unknown.ts",
      "x",
      "src/unknown.ts is a project file; it needs no eject",
    ],
    [
      "a blank reason",
      "src/a.ts",
      "   ",
      'Specify why the file is ejected: --reason "<why>"',
    ],
    [
      "an empty reason",
      "src/a.ts",
      "",
      'Specify why the file is ejected: --reason "<why>"',
    ],
    [
      "a generated file before a blank reason",
      "src/modules.generated.ts",
      " ",
      "src/modules.generated.ts is generated; change the manifest or module files and run npm run wa -- generate",
    ],
    [
      "a project file before a blank reason",
      "src/features/notes/module.ts",
      "",
      "src/features/notes/module.ts is a project file; it needs no eject",
    ],
    [
      "a path outside the project before a blank reason",
      "../x.ts",
      "",
      "Path outside the project: ../x.ts",
    ],
  ])(
    "refuses %s and leaves .wa/kit.json untouched",
    async (_case, file, reason, message) => {
      const dir = await makeProject();
      const before = await rawState(dir);
      await expect(eject(ejectOptions(dir, file, reason))).rejects.toThrow(
        message,
      );
      expect(await rawState(dir)).toBe(before);
    },
  );

  it("refuses an already ejected file without overwriting its reason", async () => {
    const dir = await makeProject({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-01-02" },
    });
    const before = await rawState(dir);
    await expect(
      eject(ejectOptions(dir, "src/a.ts", "another reason")),
    ).rejects.toThrow(
      'src/a.ts is already ejected ("custom login"); edit its reason in .wa/kit.json',
    );
    expect(await rawState(dir)).toBe(before);
  });

  it("reports an already ejected file before a blank reason", async () => {
    const dir = await makeProject({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-01-02" },
    });
    await expect(eject(ejectOptions(dir, "src/a.ts", " "))).rejects.toThrow(
      'src/a.ts is already ejected ("custom login"); edit its reason in .wa/kit.json',
    );
  });
});

async function createFixtureProject(modules: string[]): Promise<{
  kitDir: string;
  dir: string;
}> {
  const kitDir = await makeKitRepo("kit");
  const dir = join(await makeTempDir(), "app");
  await create({
    target: dir,
    kitDir,
    modules,
    locales: null,
    title: null,
    adminEmail: null,
    yes: true,
    setup: false,
    install: false,
    git: false,
    runner: async () => {},
    prompter: {
      ask: async (_question, fallback) => fallback,
      confirm: async (_question, fallback) => fallback,
      select: async (_question, choices) =>
        choices
          .filter((choice) => choice.checked)
          .map((choice) => choice.value),
    },
    log: () => {},
  });
  return { kitDir, dir };
}

async function addEjected(
  dir: string,
  ejected: KitState["ejected"],
): Promise<void> {
  const state = await readKitState(dir);
  await writeKitState(dir, {
    ...state,
    ejected: { ...state.ejected, ...ejected },
  });
}

describe("undoEject", () => {
  it(
    "restores an ejected file from the kit and removes only its entry",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      await addEjected(dir, {
        [AUTH_MODULE]: { reason: "custom auth", ejectedAt: "2026-11-23" },
        "src/i18n/config.ts": { reason: "locales", ejectedAt: "2026-11-23" },
      });
      await undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
      expect(await ejectedOf(dir)).toEqual({
        "src/i18n/config.ts": { reason: "locales", ejectedAt: "2026-11-23" },
      });
      expect(log).toHaveBeenCalledWith(
        `Restored ${AUTH_MODULE} from GatoJS 0.1.0`,
      );
    },
    SLOW,
  );

  it(
    "restores a deleted ejected file",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await addEjected(dir, {
        [AUTH_MODULE]: { reason: "custom auth", ejectedAt: "2026-11-23" },
      });
      await rm(join(dir, AUTH_MODULE));
      await undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
      expect(await ejectedOf(dir)).toEqual({});
    },
    SLOW,
  );

  it(
    "restores the file mode from the kit",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      const kitMode = (await stat(join(FIXTURE_KIT, AUTH_MODULE))).mode & 0o777;
      await chmod(join(dir, AUTH_MODULE), kitMode ^ 0o100);
      await undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log });
      expect((await stat(join(dir, AUTH_MODULE))).mode & 0o777).toBe(kitMode);
    },
    SLOW,
  );

  it(
    "restores a modified Gato file that was never ejected",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      const before = await ejectedOf(dir);
      await undoEject({
        projectDir: dir,
        file: `./${AUTH_MODULE}`,
        kitDir,
        log,
      });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
      expect(await ejectedOf(dir)).toEqual(before);
    },
    SLOW,
  );

  it(
    "regenerates the wa:* regions of a restored region file",
    async () => {
      const { kitDir, dir } = await createFixtureProject(["demo"]);
      const original = await readFile(join(dir, ".env.example"), "utf8");
      expect(original).toContain("DEMO_TOKEN");
      await writeFile(join(dir, ".env.example"), "CUSTOM=1\n");
      await addEjected(dir, {
        ".env.example": { reason: "custom env", ejectedAt: "2026-11-23" },
      });
      await undoEject({ projectDir: dir, file: ".env.example", kitDir, log });
      expect(await readFile(join(dir, ".env.example"), "utf8")).toBe(original);
      expect(await ejectedOf(dir)).toEqual({});
    },
    SLOW,
  );

  it(
    "refuses a Gato file that is missing from the kit snapshot",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      const state = await readKitState(dir);
      const core = state.modules.core as NonNullable<
        (typeof state.modules)["core"]
      >;
      await writeKitState(dir, {
        ...state,
        modules: {
          ...state.modules,
          core: {
            ...core,
            files: { ...core.files, "src/extra.ts": sha256("e") },
          },
        },
      });
      await writeProjectFile(dir, "src/extra.ts", "mine");
      const before = await rawState(dir);
      await expect(
        undoEject({ projectDir: dir, file: "src/extra.ts", kitDir, log }),
      ).rejects.toThrow("src/extra.ts is not in GatoJS 0.1.0");
      expect(await rawState(dir)).toBe(before);
      expect(await readFile(join(dir, "src/extra.ts"), "utf8")).toBe("mine");
    },
    SLOW,
  );

  it.each([
    ["../x.ts", "Path outside the project: ../x.ts"],
    [
      "src/modules.generated.ts",
      "src/modules.generated.ts is generated; change the manifest or module files and run npm run wa -- generate",
    ],
    [
      "package.json",
      "package.json is managed by GatoJS (wa update merges it); it needs no eject",
    ],
    [
      "src/features/notes/module.ts",
      "src/features/notes/module.ts is a project file; it needs no eject",
    ],
  ])(
    "refuses %s without touching the project",
    async (file, message) => {
      const { kitDir, dir } = await createFixtureProject([]);
      await writeProjectFile(dir, "src/features/notes/module.ts", "notes");
      const before = await rawState(dir);
      await expect(
        undoEject({ projectDir: dir, file, kitDir, log }),
      ).rejects.toThrow(message);
      expect(await rawState(dir)).toBe(before);
      expect(
        await readFile(join(dir, "src/features/notes/module.ts"), "utf8"),
      ).toBe("notes");
    },
    SLOW,
  );

  it(
    "refuses a seed file",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      const state = await readKitState(dir);
      const core = state.modules.core as NonNullable<
        (typeof state.modules)["core"]
      >;
      await writeKitState(dir, {
        ...state,
        modules: {
          ...state.modules,
          core: { ...core, files: { ...core.files, "docs/readme.md": "seed" } },
        },
      });
      await writeProjectFile(dir, "docs/readme.md", "project notes");
      await expect(
        undoEject({ projectDir: dir, file: "docs/readme.md", kitDir, log }),
      ).rejects.toThrow(
        "docs/readme.md is a seed file owned by the project; it needs no eject",
      );
      expect(await readFile(join(dir, "docs/readme.md"), "utf8")).toBe(
        "project notes",
      );
    },
    SLOW,
  );

  it(
    "does not create a refused file",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await expect(
        undoEject({ projectDir: dir, file: "src/unknown.ts", kitDir, log }),
      ).rejects.toThrow("src/unknown.ts is a project file; it needs no eject");
      expect(existsSync(join(dir, "src/unknown.ts"))).toBe(false);
    },
    SLOW,
  );
});
