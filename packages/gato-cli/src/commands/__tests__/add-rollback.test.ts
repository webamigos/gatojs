import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  IGNORE,
  makeKitRepo,
  removeTempDirs,
  snapshotDir,
} from "../../__tests__/helpers.js";
import type { Runner } from "../../process/runner.js";
import { add } from "../add.js";

const failure = vi.hoisted(() => ({ armed: false }));

vi.mock("../../assemble/copy.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../assemble/copy.js")>();
  return {
    ...original,
    copyFiles: async (input: Parameters<typeof original.copyFiles>[0]) => {
      if (!failure.armed) return original.copyFiles(input);
      await mkdir(join(input.projectDir, "src/features/demo/i18n"), {
        recursive: true,
      });
      await writeFile(
        join(input.projectDir, "src/features/demo/module.ts"),
        "export default 1;\n",
      );
      await writeFile(
        join(input.projectDir, "src/features/demo/i18n/obcy.txt"),
        "obcy\n",
      );
      throw new Error("kopiowanie padło");
    },
  };
});

let kitDir: string;
let log: ReturnType<typeof vi.fn<(line: string) => void>>;
const runner = vi.fn<Runner>(async () => {});

beforeEach(async () => {
  kitDir = await makeKitRepo("kit");
  log = vi.fn<(line: string) => void>();
  failure.armed = false;
});

afterEach(async () => {
  failure.armed = false;
  await removeTempDirs();
});

describe("add: obcy plik w katalogu utworzonym przez add", () => {
  it("rzuca oryginalny błąd, usuwa plik modułu, zostawia obcy plik i loguje oba katalogi", async () => {
    const dir = await createProject("app", []);
    const packageBefore = await readFile(join(dir, "package.json"), "utf8");
    const stateBefore = await readFile(join(dir, ".wa/kit.json"), "utf8");
    failure.armed = true;
    await expect(
      add({
        projectDir: dir,
        module: "demo",
        kitDir,
        install: false,
        runner,
        log,
      }),
    ).rejects.toThrow("kopiowanie padło");
    expect(existsSync(join(dir, "src/features/demo/module.ts"))).toBe(false);
    expect(
      await readFile(join(dir, "src/features/demo/i18n/obcy.txt"), "utf8"),
    ).toBe("obcy\n");
    const cleanupLines = log.mock.calls
      .map(([line]) => line)
      .filter((line) => line.includes("Could not clean up"));
    expect(cleanupLines).toEqual([
      "Could not clean up: src/features/demo/i18n (ENOTEMPTY)",
      "Could not clean up: src/features/demo (ENOTEMPTY)",
    ]);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(
      packageBefore,
    );
    expect(await readFile(join(dir, ".wa/kit.json"), "utf8")).toBe(stateBefore);
    const snapshot = await snapshotDir(dir, IGNORE);
    expect(
      Object.keys(snapshot).filter((path) =>
        path.startsWith("src/features/demo"),
      ),
    ).toEqual(["src/features/demo/i18n/obcy.txt"]);
  });
});
