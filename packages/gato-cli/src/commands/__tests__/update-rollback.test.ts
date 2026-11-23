import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { spawnRunner } from "../../process/runner.js";
import type { Runner } from "../../process/runner.js";
import { update } from "../update.js";

const failures = vi.hoisted(() => ({
  halfWritePath: null as string | null,
  removePath: null as string | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  const busy = () =>
    Object.assign(new Error("zasób zajęty"), { code: "EBUSY" });
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
      if (typeof path === "string" && path === failures.removePath) {
        throw busy();
      }
      return original.rm(...args);
    },
    unlink: async (
      ...args: Parameters<typeof original.unlink>
    ): Promise<void> => {
      const [path] = args;
      if (typeof path === "string" && path === failures.removePath) {
        throw busy();
      }
      return original.unlink(...args);
    },
  };
});

const AUTH_MODULE = "src/features/auth/module.ts";
const BIN = ".wa/bin/wa.mjs";
const ADDED = "src/shared/lib/rate-limit.ts";
const UNDO_HINT =
  "Check git status; to undo everything: git restore . && git clean -fd";

let log: ReturnType<typeof vi.fn<(line: string) => void>>;
const runner = vi.fn<Runner>(async () => {});

beforeEach(() => {
  log = vi.fn<(line: string) => void>();
  runner.mockClear();
  failures.halfWritePath = null;
  failures.removePath = null;
});

afterEach(async () => {
  failures.halfWritePath = null;
  failures.removePath = null;
  await removeTempDirs();
});

function cleanupWarnings(): string[] {
  return log.mock.calls
    .map(([line]) => line)
    .filter((line) => line.includes("Could not clean up"));
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

async function prepare(): Promise<{
  dir: string;
  baseKitDir: string;
  targetKitDir: string;
}> {
  const kitDir = await makeTaggedKit(async (kit) => {
    await writeFile(
      join(kit, BIN),
      '#!/usr/bin/env node\nconsole.log("wa 0.2.0");\n',
    );
    await chmod(join(kit, BIN), 0o755);
    await mkdir(dirname(join(kit, ADDED)), { recursive: true });
    await writeFile(join(kit, ADDED), "export const limit = 10;\n");
    await writeFile(
      join(kit, "src/i18n/config.ts"),
      'export type Locale = "pl";\n',
    );
    await rm(join(kit, AUTH_MODULE));
  });
  const dir = await createProjectFromTag(kitDir, "app", []);
  return {
    dir,
    baseKitDir: await cloneTag(kitDir, "0.1.0"),
    targetKitDir: await cloneTag(kitDir, "0.2.0"),
  };
}

function run(setup: { dir: string; baseKitDir: string; targetKitDir: string }) {
  return update({
    projectDir: setup.dir,
    version: "0.2.0",
    baseKitDir: setup.baseKitDir,
    targetKitDir: setup.targetKitDir,
    dryRun: false,
    install: true,
    runner,
    log,
  });
}

describe("update: błąd zapisu cofa wszystkie zmiany", () => {
  it(".wa/kit.json zapisany w połowie z ENOSPC: przywrócony usunięty plik i katalog, zaktualizowane pliki z treścią i trybem, dodany plik i jego katalog usunięte", async () => {
    const setup = await prepare();
    const before = await snapshotDir(setup.dir, IGNORE);
    const binModeBefore = (await stat(join(setup.dir, BIN))).mode & 0o777;
    failures.halfWritePath = join(setup.dir, ".wa/kit.json");

    const failure = run(setup);
    await expect(failure).rejects.toThrow(
      `brak miejsca na dysku\n${UNDO_HINT}`,
    );
    await expect(failure).rejects.toMatchObject({
      cause: { code: "ENOSPC", message: "brak miejsca na dysku" },
    });

    expect(await snapshotDir(setup.dir, IGNORE)).toEqual(before);
    expect(await readFile(join(setup.dir, AUTH_MODULE), "utf8")).toBe(
      'export default { key: "auth" };\n',
    );
    expect((await stat(join(setup.dir, BIN))).mode & 0o777).toBe(binModeBefore);
    expect(binModeBefore).toBe(0o644);
    expect(existsSync(join(setup.dir, ADDED))).toBe(false);
    expect(existsSync(join(setup.dir, "src/shared/lib"))).toBe(false);
    expect(cleanupWarnings()).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("nieudane usunięcie dodanego pliku przy cofaniu: linia sprzątania z kodem, reszta przywrócona, rzucony pierwotny błąd", async () => {
    const setup = await prepare();
    const before = await snapshotDir(setup.dir, IGNORE);
    failures.halfWritePath = join(setup.dir, ".wa/kit.json");
    failures.removePath = join(setup.dir, ADDED);

    const failure = run(setup);
    await expect(failure).rejects.toThrow(
      `brak miejsca na dysku\n${UNDO_HINT}`,
    );
    await expect(failure).rejects.toMatchObject({
      cause: { code: "ENOSPC" },
    });

    expect(cleanupWarnings()).toContain(
      "Could not clean up: src/shared/lib/rate-limit.ts (EBUSY)",
    );
    const after = await snapshotDir(setup.dir, IGNORE);
    expect(after[AUTH_MODULE]).toBe(before[AUTH_MODULE]);
    expect(after[BIN]).toBe(before[BIN]);
    expect(after["src/i18n/config.ts"]).toBe(before["src/i18n/config.ts"]);
    expect(after[".wa/kit.json"]).toBe(before[".wa/kit.json"]);
    expect(runner).not.toHaveBeenCalled();
  });

  it.skipIf(process.getuid?.() === 0)(
    "plik tylko do odczytu w katalogu bez prawa zapisu: pierwotny błąd, wszystkie pliki i .wa/kit.json bajt w bajt jak przed komendą",
    async () => {
      const kitDir = await makeTaggedKit(async (kit) => {
        await writeFile(
          join(kit, BIN),
          '#!/usr/bin/env node\nconsole.log("wa 0.2.0");\n',
        );
        await mkdir(dirname(join(kit, ADDED)), { recursive: true });
        await writeFile(join(kit, ADDED), "export const limit = 10;\n");
        await writeFile(
          join(kit, AUTH_MODULE),
          'export default { key: "auth", version: "v0.2.0" };\n',
        );
      });
      const dir = await createProjectFromTag(kitDir, "app", []);
      const setup = {
        dir,
        baseKitDir: await cloneTag(kitDir, "0.1.0"),
        targetKitDir: await cloneTag(kitDir, "0.2.0"),
      };
      const before = await snapshotDir(dir, IGNORE);
      await chmod(join(dir, AUTH_MODULE), 0o444);
      await chmod(join(dir, "src/features/auth"), 0o555);
      try {
        await expect(run(setup)).rejects.toThrow(UNDO_HINT);
      } finally {
        await chmod(join(dir, "src/features/auth"), 0o755);
        await chmod(join(dir, AUTH_MODULE), 0o644);
      }

      expect(await snapshotDir(dir, IGNORE)).toEqual(before);
      expect(existsSync(join(dir, "src/shared/lib"))).toBe(false);
      expect(cleanupWarnings()).toEqual([]);
      expect(runner).not.toHaveBeenCalled();
    },
  );

  it("plik z kitu w trybie 0o444, zapis .wa/kit.json pada ENOSPC: plik bajt w bajt jak przed, tryb 0o644, bez linii sprzątania", async () => {
    const kitDir = await makeTaggedKit(async (kit) => {
      await writeFile(
        join(kit, BIN),
        '#!/usr/bin/env node\nconsole.log("wa 0.2.0");\n',
      );
    });
    const dir = await createProjectFromTag(kitDir, "app", []);
    const targetKitDir = await cloneTag(kitDir, "0.2.0");
    await chmod(join(targetKitDir, BIN), 0o444);
    const setup = {
      dir,
      baseKitDir: await cloneTag(kitDir, "0.1.0"),
      targetKitDir,
    };
    const before = await snapshotDir(dir, IGNORE);
    failures.halfWritePath = join(dir, ".wa/kit.json");

    await expect(run(setup)).rejects.toThrow(
      `brak miejsca na dysku\n${UNDO_HINT}`,
    );

    expect(await readFile(join(dir, BIN), "utf8")).toBe(
      '#!/usr/bin/env node\nconsole.log("wa");\n',
    );
    expect((await stat(join(dir, BIN))).mode & 0o777).toBe(0o644);
    expect(await snapshotDir(dir, IGNORE)).toEqual(before);
    expect(cleanupWarnings()).toEqual([]);
  });
});
