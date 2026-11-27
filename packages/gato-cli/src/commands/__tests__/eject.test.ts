import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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
import type { Runner } from "../../process/runner.js";
import { create } from "../create.js";
import { eject, undoEject, undoEjectFromSource } from "../eject.js";

const failures = vi.hoisted(() => ({
  writeKitState: null as Error | null,
  generate: null as Error | null,
  chmodPath: null as string | null,
  writePath: null as string | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    chmod: async (
      ...args: Parameters<typeof original.chmod>
    ): Promise<void> => {
      const [path] = args;
      if (typeof path === "string" && path === failures.chmodPath) {
        failures.chmodPath = null;
        throw new Error("chmod denied");
      }
      return original.chmod(...args);
    },
    writeFile: async (
      ...args: Parameters<typeof original.writeFile>
    ): Promise<void> => {
      const [path] = args;
      if (typeof path === "string" && path === failures.writePath) {
        failures.writePath = null;
        throw new Error("write denied");
      }
      return original.writeFile(...args);
    },
  };
});

vi.mock("../../manifest/kit-state.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../manifest/kit-state.js")>();
  return {
    ...original,
    writeKitState: async (
      ...args: Parameters<typeof original.writeKitState>
    ): Promise<void> => {
      const error = failures.writeKitState;
      if (error === null) return original.writeKitState(...args);
      failures.writeKitState = null;
      await original.writeKitState(...args);
      throw error;
    },
  };
});

vi.mock("../../generate/index.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../generate/index.js")>();
  return {
    ...original,
    generate: async (
      ...args: Parameters<typeof original.generate>
    ): Promise<{ changed: string[] }> => {
      const error = failures.generate;
      if (error === null) return original.generate(...args);
      failures.generate = null;
      throw error;
    },
  };
});

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
  failures.writeKitState = null;
  failures.generate = null;
  failures.chmodPath = null;
  failures.writePath = null;
});

afterEach(async () => {
  failures.writeKitState = null;
  failures.generate = null;
  failures.chmodPath = null;
  failures.writePath = null;
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
    selfhostCompose: null,
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
      "EXTENSION_POINTS.md",
      "EXTENSION_POINTS.md",
      "x",
      "EXTENSION_POINTS.md is generated; change the manifest or module files and run npm run wa -- generate",
    ],
    [
      "src/extension-points.generated.ts",
      "src/extension-points.generated.ts",
      "x",
      "src/extension-points.generated.ts is generated; change the manifest or module files and run npm run wa -- generate",
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

async function createFixtureProject(
  modules: string[],
  name = "app",
): Promise<{
  kitDir: string;
  dir: string;
}> {
  const kitDir = await makeKitRepo("kit");
  const dir = join(await makeTempDir(), name);
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
    "does not regenerate wa:* regions when the restored file has none",
    async () => {
      const { kitDir, dir } = await createFixtureProject(["demo"]);
      const original = await readFile(join(dir, ".env.example"), "utf8");
      expect(original).toContain("DEMO_TOKEN");
      const drifted = original.replace(
        /# wa:modules:start\n[\s\S]*?# wa:modules:end/,
        "# wa:modules:start\nDRIFTED=1\n# wa:modules:end",
      );
      expect(drifted).toContain("DRIFTED=1");
      expect(drifted).not.toContain("DEMO_TOKEN");
      await writeFile(join(dir, ".env.example"), drifted);
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      await undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
      expect(await readFile(join(dir, ".env.example"), "utf8")).toBe(drifted);
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

const MY_APP_ENV_EXAMPLE = `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/my_app
BETTER_AUTH_SECRET=change-me-to-a-random-string-of-at-least-32-chars
ADMIN_EMAIL=

# wa:modules:start
# wa:modules:end
`;

describe("undoEject with a hyphenated project slug", () => {
  it(
    "restores a placeholder file with the project's snake name",
    async () => {
      const { kitDir, dir } = await createFixtureProject([], "my-app");
      await writeFile(join(dir, ".env.example"), "CUSTOM=1\n");
      await undoEject({ projectDir: dir, file: ".env.example", kitDir, log });
      const restored = await readFile(join(dir, ".env.example"), "utf8");
      expect(restored).toBe(MY_APP_ENV_EXAMPLE);
      expect(restored).not.toContain("wa_app");
    },
    SLOW,
  );
});

async function setKitRepo(dir: string, kitRepo: string): Promise<void> {
  const state = await readKitState(dir);
  await writeKitState(dir, { ...state, kitRepo });
}

async function kitWithVersion(version: string): Promise<string> {
  const kitDir = await makeKitRepo("kit");
  const configPath = join(kitDir, "kit", "kit.json");
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    config.replace('"version": "0.1.0"', `"version": "${version}"`),
  );
  return kitDir;
}

describe("undoEjectFromSource", () => {
  let runner: ReturnType<typeof vi.fn<Runner>>;

  beforeEach(() => {
    runner = vi.fn<Runner>(async () => {});
  });

  it(
    "restores the file from the kit given by kitFlag",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      await addEjected(dir, {
        [AUTH_MODULE]: { reason: "custom auth", ejectedAt: "2026-11-23" },
      });
      await undoEjectFromSource({
        projectDir: dir,
        file: AUTH_MODULE,
        kitFlag: kitDir,
        envSource: undefined,
        runner,
        tmpDir: await makeTempDir(),
        log,
      });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
      expect(await ejectedOf(dir)).toEqual({});
      expect(log).toHaveBeenCalledWith(
        `Restored ${AUTH_MODULE} from GatoJS 0.1.0`,
      );
      expect(runner).not.toHaveBeenCalled();
    },
    SLOW,
  );

  it(
    "restores the file from the kit given by envSource when kitFlag is null",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await setKitRepo(dir, "/nonexistent/gato-kit");
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      await undoEjectFromSource({
        projectDir: dir,
        file: AUTH_MODULE,
        kitFlag: null,
        envSource: kitDir,
        runner,
        tmpDir: await makeTempDir(),
        log,
      });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
    },
    SLOW,
  );

  it(
    "prefers kitFlag over envSource",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      await undoEjectFromSource({
        projectDir: dir,
        file: AUTH_MODULE,
        kitFlag: kitDir,
        envSource: "/nonexistent/gato-kit",
        runner,
        tmpDir: await makeTempDir(),
        log,
      });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
    },
    SLOW,
  );

  it(
    "restores the file from state.kitRepo when kitFlag and envSource are absent",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await setKitRepo(dir, kitDir);
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      await undoEjectFromSource({
        projectDir: dir,
        file: AUTH_MODULE,
        kitFlag: null,
        envSource: undefined,
        runner,
        tmpDir: await makeTempDir(),
        log,
      });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
    },
    SLOW,
  );

  it(
    "clones a remote state.kitRepo at the tag of the project's kit version",
    async () => {
      const { kitDir, dir } = await createFixtureProject([]);
      await setKitRepo(dir, "https://example.com/org/gato-kit.git");
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      const tmpDir = await makeTempDir();
      runner.mockImplementation(async (_command, args) => {
        const target = args[args.length - 1];
        if (target !== undefined) {
          await cp(kitDir, target, { recursive: true });
        }
      });
      await undoEjectFromSource({
        projectDir: dir,
        file: AUTH_MODULE,
        kitFlag: null,
        envSource: undefined,
        runner,
        tmpDir,
        log,
      });
      expect(runner).toHaveBeenCalledTimes(1);
      const [command, args] = runner.mock.calls[0] ?? [];
      expect(command).toBe("git");
      expect(args).toContain("clone");
      expect(args).toContain("https://example.com/org/gato-kit.git");
      const branch = (args ?? []).indexOf("--branch");
      expect(branch).toBeGreaterThanOrEqual(0);
      expect(args?.[branch + 1]).toBe("v0.1.0");
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
    },
    SLOW,
  );

  it(
    "rejects a kitFlag kit at another version and leaves the project unchanged",
    async () => {
      const { dir } = await createFixtureProject([]);
      const otherKit = await kitWithVersion("0.2.0");
      await writeFile(join(dir, AUTH_MODULE), "export default {};\n");
      await addEjected(dir, {
        [AUTH_MODULE]: { reason: "custom auth", ejectedAt: "2026-11-23" },
      });
      const before = await rawState(dir);
      await expect(
        undoEjectFromSource({
          projectDir: dir,
          file: AUTH_MODULE,
          kitFlag: otherKit,
          envSource: undefined,
          runner,
          tmpDir: await makeTempDir(),
          log,
        }),
      ).rejects.toThrow(
        `Kit in ${otherKit} has version 0.2.0, the project uses 0.1.0`,
      );
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        "export default {};\n",
      );
      expect(await rawState(dir)).toBe(before);
    },
    SLOW,
  );
});

async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

describe("undoEject rollback", () => {
  const ENV_EXAMPLE = ".env.example";

  async function projectWithModifiedAuthModule(): Promise<{
    kitDir: string;
    dir: string;
  }> {
    const { kitDir, dir } = await createFixtureProject([]);
    await chmod(join(kitDir, AUTH_MODULE), 0o755);
    await writeFile(join(dir, AUTH_MODULE), "project\n");
    await chmod(join(dir, AUTH_MODULE), 0o644);
    await addEjected(dir, {
      [AUTH_MODULE]: { reason: "custom auth", ejectedAt: "2026-11-23" },
    });
    return { kitDir, dir };
  }

  it(
    "rethrows a failed state write and restores the file content, mode and .wa/kit.json",
    async () => {
      const { kitDir, dir } = await projectWithModifiedAuthModule();
      const stateBefore = await readFile(join(dir, ".wa/kit.json"));
      failures.writeKitState = new Error("disk full");
      await expect(
        undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log }),
      ).rejects.toThrow("disk full");
      expect(await readFile(join(dir, AUTH_MODULE))).toEqual(
        Buffer.from("project\n"),
      );
      expect(await modeOf(join(dir, AUTH_MODULE))).toBe(0o644);
      expect(await readFile(join(dir, ".wa/kit.json"))).toEqual(stateBefore);
      expect(log).not.toHaveBeenCalledWith(
        `Restored ${AUTH_MODULE} from GatoJS 0.1.0`,
      );
    },
    SLOW,
  );

  it(
    "removes the restored file again when the state write fails and the file did not exist",
    async () => {
      const { kitDir, dir } = await projectWithModifiedAuthModule();
      await rm(join(dir, AUTH_MODULE));
      const stateBefore = await readFile(join(dir, ".wa/kit.json"));
      failures.writeKitState = new Error("disk full");
      await expect(
        undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log }),
      ).rejects.toThrow("disk full");
      expect(existsSync(join(dir, AUTH_MODULE))).toBe(false);
      expect(await readFile(join(dir, ".wa/kit.json"))).toEqual(stateBefore);
    },
    SLOW,
  );

  it(
    "rethrows a failed write of a deleted file and leaves it absent",
    async () => {
      const { kitDir, dir } = await projectWithModifiedAuthModule();
      await rm(join(dir, AUTH_MODULE));
      const stateBefore = await readFile(join(dir, ".wa/kit.json"));
      failures.writePath = join(dir, AUTH_MODULE);
      await expect(
        undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log }),
      ).rejects.toThrow("write denied");
      expect(existsSync(join(dir, AUTH_MODULE))).toBe(false);
      expect(await readFile(join(dir, ".wa/kit.json"))).toEqual(stateBefore);
    },
    SLOW,
  );

  it(
    "rethrows a failed mode write and restores the file content and mode",
    async () => {
      const { kitDir, dir } = await projectWithModifiedAuthModule();
      const stateBefore = await readFile(join(dir, ".wa/kit.json"));
      failures.chmodPath = join(dir, AUTH_MODULE);
      await expect(
        undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log }),
      ).rejects.toThrow("chmod denied");
      expect(await readFile(join(dir, AUTH_MODULE))).toEqual(
        Buffer.from("project\n"),
      );
      expect(await modeOf(join(dir, AUTH_MODULE))).toBe(0o644);
      expect(await readFile(join(dir, ".wa/kit.json"))).toEqual(stateBefore);
    },
    SLOW,
  );

  it(
    "rethrows a failed generate for a region file and restores the file and the ejected entry",
    async () => {
      const { kitDir, dir } = await createFixtureProject(["demo"]);
      await chmod(join(kitDir, ENV_EXAMPLE), 0o644);
      await writeFile(join(dir, ENV_EXAMPLE), "CUSTOM=1\n");
      await chmod(join(dir, ENV_EXAMPLE), 0o600);
      await addEjected(dir, {
        [ENV_EXAMPLE]: { reason: "custom env", ejectedAt: "2026-11-23" },
      });
      const stateBefore = await readFile(join(dir, ".wa/kit.json"));
      failures.generate = new Error("generate broke");
      await expect(
        undoEject({ projectDir: dir, file: ENV_EXAMPLE, kitDir, log }),
      ).rejects.toThrow("generate broke");
      expect(await readFile(join(dir, ENV_EXAMPLE))).toEqual(
        Buffer.from("CUSTOM=1\n"),
      );
      expect(await modeOf(join(dir, ENV_EXAMPLE))).toBe(0o600);
      expect(await readFile(join(dir, ".wa/kit.json"))).toEqual(stateBefore);
      expect(await ejectedOf(dir)).toEqual({
        [ENV_EXAMPLE]: { reason: "custom env", ejectedAt: "2026-11-23" },
      });
    },
    SLOW,
  );

  it(
    "removes a deleted region file again when generate fails",
    async () => {
      const { kitDir, dir } = await createFixtureProject(["demo"]);
      await rm(join(dir, ENV_EXAMPLE));
      const stateBefore = await readFile(join(dir, ".wa/kit.json"));
      failures.generate = new Error("generate broke");
      await expect(
        undoEject({ projectDir: dir, file: ENV_EXAMPLE, kitDir, log }),
      ).rejects.toThrow("generate broke");
      expect(existsSync(join(dir, ENV_EXAMPLE))).toBe(false);
      expect(await readFile(join(dir, ".wa/kit.json"))).toEqual(stateBefore);
    },
    SLOW,
  );

  it(
    "on success restores the kit content and mode, removes the entry and logs the restore",
    async () => {
      const { kitDir, dir } = await projectWithModifiedAuthModule();
      await undoEject({ projectDir: dir, file: AUTH_MODULE, kitDir, log });
      expect(await readFile(join(dir, AUTH_MODULE), "utf8")).toBe(
        AUTH_MODULE_CONTENT,
      );
      expect(await modeOf(join(dir, AUTH_MODULE))).toBe(0o755);
      expect(await ejectedOf(dir)).toEqual({});
      expect(log).toHaveBeenCalledWith(
        `Restored ${AUTH_MODULE} from GatoJS 0.1.0`,
      );
    },
    SLOW,
  );
});
