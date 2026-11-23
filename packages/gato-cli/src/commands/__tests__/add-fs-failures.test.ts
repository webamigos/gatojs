import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  makeKitRepo,
  removeTempDirs,
} from "../../__tests__/helpers.js";
import type { Runner } from "../../process/runner.js";
import { add } from "../add.js";

const failures = vi.hoisted(() => ({
  halfWritePath: null as string | null,
  removePath: null as string | null,
  removeError: null as Error | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    writeFile: async (
      ...args: Parameters<typeof original.writeFile>
    ): Promise<void> => {
      const [path, data] = args;
      if (typeof path === "string" && path === failures.halfWritePath) {
        failures.halfWritePath = null;
        const text = String(data);
        await original.writeFile(path, text.slice(0, text.length / 2));
        throw Object.assign(new Error("brak miejsca na dysku"), {
          code: "ENOSPC",
        });
      }
      return original.writeFile(...args);
    },
    rm: async (...args: Parameters<typeof original.rm>): Promise<void> => {
      const [path] = args;
      if (
        typeof path === "string" &&
        path === failures.removePath &&
        failures.removeError !== null
      ) {
        const error = failures.removeError;
        failures.removePath = null;
        failures.removeError = null;
        throw error;
      }
      return original.rm(...args);
    },
  };
});

let kitDir: string;
let log: ReturnType<typeof vi.fn<(line: string) => void>>;
const runner = vi.fn<Runner>(async () => {});

beforeEach(async () => {
  kitDir = await makeKitRepo("kit");
  log = vi.fn<(line: string) => void>();
  failures.halfWritePath = null;
  failures.removePath = null;
  failures.removeError = null;
});

afterEach(async () => {
  failures.halfWritePath = null;
  failures.removePath = null;
  failures.removeError = null;
  await removeTempDirs();
});

function cleanupWarnings(): string[] {
  return log.mock.calls
    .map(([line]) => line)
    .filter((line) => line.includes("Could not clean up"));
}

const DEMO_FILES = [
  "src/features/demo/compose.yml",
  "src/features/demo/env.ts",
  "src/features/demo/i18n/pl.json",
  "src/features/demo/module.ts",
];

describe("add: zapis przerwany w połowie", () => {
  it("package.json zapisany w połowie z ENOSPC: oryginalny błąd, package.json bajt w bajt, brak plików modułu i linii sprzątania", async () => {
    const dir = await createProject("app", []);
    const packageBefore = await readFile(join(dir, "package.json"), "utf8");
    const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
    failures.halfWritePath = join(dir, "package.json");
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: true,
        runner,
        log,
      }),
    ).rejects.toMatchObject({ code: "ENOSPC" });
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
      packageBefore,
    );
    expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(stateBefore);
    for (const file of DEMO_FILES) {
      expect(existsSync(join(dir, file))).toBe(false);
    }
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    expect(cleanupWarnings()).toEqual([]);
  });

  it(".wa/kit.json zapisany w połowie z ENOSPC: oba pliki bajt w bajt jak przed, brak plików modułu i linii sprzątania", async () => {
    const dir = await createProject("app", []);
    const packageBefore = await readFile(join(dir, "package.json"), "utf8");
    const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
    failures.halfWritePath = join(dir, ".wa/kit.json");
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: true,
        runner,
        log,
      }),
    ).rejects.toMatchObject({ code: "ENOSPC" });
    expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(stateBefore);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
      packageBefore,
    );
    for (const file of DEMO_FILES) {
      expect(existsSync(join(dir, file))).toBe(false);
    }
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    expect(cleanupWarnings()).toEqual([]);
  });
});

describe("add: awaria usuwania pliku modułu przy sprzątaniu", () => {
  async function addWithMissingKitFile(
    removeError: Error,
  ): Promise<{ dir: string; error: unknown }> {
    const kitCopy = await makeKitRepo("kit");
    await rm(join(kitCopy, "src/features/demo/module.ts"));
    const dir = await createProject("app", []);
    failures.removePath = join(dir, "src/features/demo/module.ts");
    failures.removeError = removeError;
    const error = await add({
      projectDir: dir,
      module: "demo",
      kitDir: kitCopy,
      install: false,
      runner,
      log,
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    return { dir, error };
  }

  it("błąd bez code: linia logu ma message w nawiasie, a rzucony jest oryginalny błąd", async () => {
    const { dir, error } = await addWithMissingKitFile(
      new Error("dysk odłączony"),
    );
    expect(error).toMatchObject({ code: "ENOENT" });
    expect(cleanupWarnings()).toEqual([
      "Could not clean up: src/features/demo/module.ts (dysk odłączony)",
    ]);
    expect(existsSync(join(dir, "src/features/demo/env.ts"))).toBe(false);
    expect(existsSync(join(dir, "src/features/demo/compose.yml"))).toBe(false);
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
  });

  it("błąd z code EBUSY: linia logu ma code, a nie message", async () => {
    const { dir, error } = await addWithMissingKitFile(
      Object.assign(new Error("zasób zajęty"), { code: "EBUSY" }),
    );
    expect(error).toMatchObject({ code: "ENOENT" });
    expect(cleanupWarnings()).toEqual([
      "Could not clean up: src/features/demo/module.ts (EBUSY)",
    ]);
    expect(existsSync(join(dir, "src/features/demo/env.ts"))).toBe(false);
  });
});
