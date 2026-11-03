import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import type { UpdateArgs } from "../../args.js";
import { cloneKitVersion } from "../../kit/source.js";
import { spawnRunner } from "../../process/runner.js";
import type { Runner } from "../../process/runner.js";
import { updateFromSource } from "../update.js";

const exec = promisify(execFile);

const AUTH_MODULE = "src/features/auth/module.ts";
const UPDATED_AUTH = 'export default { key: "auth", version: "v0.2.0" };\n';

let kitDir: string;
let dir: string;
let tmpRoot: string;
let runner: ReturnType<typeof vi.fn<Runner>>;
let log: ReturnType<typeof vi.fn<(line: string) => void>>;

beforeEach(async () => {
  kitDir = await makeTaggedKit(async (kit) => {
    await writeFile(join(kit, AUTH_MODULE), UPDATED_AUTH);
  });
  dir = await createProjectFromTag(kitDir, "app", []);
  tmpRoot = await makeTempDir("wa-kit-update-root-");
  log = vi.fn<(line: string) => void>();
  runner = vi.fn<Runner>(async (command, args, cwd) => {
    if (command === "git") {
      await spawnRunner(command, args, cwd);
    }
  });
});

afterEach(async () => {
  await removeTempDirs();
});

function args(overrides: Partial<UpdateArgs> = {}): UpdateArgs {
  return {
    version: "0.2.0",
    kit: kitDir,
    fromKit: null,
    dryRun: false,
    install: false,
    ...overrides,
  };
}

function run(
  overrides: Partial<UpdateArgs> = {},
  options: { bundleKitDir?: string; envSource?: string } = {},
) {
  return updateFromSource({
    projectDir: dir,
    args: args(overrides),
    envSource: options.envSource,
    bundleKitDir: options.bundleKitDir ?? dir,
    runner,
    log,
    tmpRoot,
  });
}

async function cloneTag(version: string): Promise<string> {
  return cloneKitVersion({
    source: kitDir,
    version,
    runner: spawnRunner,
    tmpDir: await makeTempDir("wa-kit-tag-"),
    name: "kit",
  });
}

async function setKitVersion(kit: string, version: string): Promise<void> {
  const path = join(kit, "kit", "kit.json");
  const config = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(path, JSON.stringify({ ...config, version }, null, 2));
}

function callsOf(command: string) {
  return runner.mock.calls.filter(([name]) => name === command);
}

function clonePathOf(call: Parameters<Runner>): string {
  return call[1][call[1].length - 1] as string;
}

async function readAuth(): Promise<string> {
  return readFile(join(dir, AUTH_MODULE), "utf8");
}

describe("updateFromSource — bundel projektu", () => {
  it("klonuje v0.2.0 do katalogu wa-update-* i przekazuje pracę bundlowi klonu z --from-kit i --kit, w katalogu projektu", async () => {
    const result = await run({ install: true });
    expect(result).toEqual({ exitCode: 0 });
    expect(runner).toHaveBeenCalledTimes(2);
    const [clone, node] = runner.mock.calls;
    expect(clone?.[0]).toBe("git");
    expect(clone?.[1].slice(0, 8)).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      "v0.2.0",
      "--quiet",
      "--",
      kitDir,
    ]);
    const clonePath = clonePathOf(clone as Parameters<Runner>);
    expect(clonePath.startsWith(`${tmpRoot}/wa-update-`)).toBe(true);
    expect(clonePath).toMatch(/\/wa-update-[^/]+\/target$/);
    expect(node).toEqual([
      "node",
      [
        join(clonePath, ".wa/bin/wa.mjs"),
        "update",
        "0.2.0",
        "--from-kit",
        clonePath,
        "--kit",
        kitDir,
      ],
      dir,
    ]);
  });

  it("z --dry-run --no-install przekazuje obie flagi procesowi potomnemu", async () => {
    await run({ dryRun: true, install: false });
    const [clone] = callsOf("git");
    const clonePath = clonePathOf(clone as Parameters<Runner>);
    expect(callsOf("node")).toEqual([
      [
        "node",
        [
          join(clonePath, ".wa/bin/wa.mjs"),
          "update",
          "0.2.0",
          "--from-kit",
          clonePath,
          "--kit",
          kitDir,
          "--dry-run",
          "--no-install",
        ],
        dir,
      ],
    ]);
  });

  it("samo --dry-run przekazuje --dry-run bez --no-install", async () => {
    await run({ dryRun: true, install: true });
    const [clone] = callsOf("git");
    const clonePath = clonePathOf(clone as Parameters<Runner>);
    expect(callsOf("node")[0]?.[1]).toEqual([
      join(clonePath, ".wa/bin/wa.mjs"),
      "update",
      "0.2.0",
      "--from-kit",
      clonePath,
      "--kit",
      kitDir,
      "--dry-run",
    ]);
  });

  it("samo --no-install przekazuje --no-install bez --dry-run", async () => {
    await run({ dryRun: false, install: false });
    const [clone] = callsOf("git");
    const clonePath = clonePathOf(clone as Parameters<Runner>);
    expect(callsOf("node")[0]?.[1]).toEqual([
      join(clonePath, ".wa/bin/wa.mjs"),
      "update",
      "0.2.0",
      "--from-kit",
      clonePath,
      "--kit",
      kitDir,
      "--no-install",
    ]);
  });

  it("bez --kit źródłem jest WA_KIT_SOURCE i to ono trafia do --kit procesu potomnego", async () => {
    await run({ kit: null, install: true }, { envSource: kitDir });
    const [clone] = callsOf("git");
    expect(clone?.[1][7]).toBe(kitDir);
    const clonePath = clonePathOf(clone as Parameters<Runner>);
    expect(callsOf("node")[0]?.[1]).toEqual([
      join(clonePath, ".wa/bin/wa.mjs"),
      "update",
      "0.2.0",
      "--from-kit",
      clonePath,
      "--kit",
      kitDir,
    ]);
  });

  it("katalog wa-update-* znika po udanej delegacji, a projekt zostaje bez zmian", async () => {
    const before = await snapshotDir(dir, IGNORE);
    await run();
    expect(await readdir(tmpRoot)).toEqual([]);
    expect(await snapshotDir(dir, IGNORE)).toEqual(before);
  });

  it("błąd procesu potomnego daje exitCode 1 bez dodatkowych linii logu i usuwa katalog tymczasowy", async () => {
    runner.mockImplementation(async (command, commandArgs, cwd) => {
      if (command === "git") {
        await spawnRunner(command, commandArgs, cwd);
        return;
      }
      throw new Error("node zakończone kodem 1");
    });
    const result = await run();
    expect(result).toEqual({ exitCode: 1 });
    expect(callsOf("node")).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("bundleKitDir z katalogiem kit/ bez kit/kit.json jest bundlem projektu i deleguje do node z --from-kit", async () => {
    const bundleDir = await makeTempDir("wa-kit-bundle-");
    await mkdir(join(bundleDir, "kit"));
    await writeFile(join(bundleDir, "kit", "README.md"), "inny plik\n");
    const result = await run({}, { bundleKitDir: bundleDir });
    expect(result).toEqual({ exitCode: 0 });
    const nodeCalls = callsOf("node");
    expect(nodeCalls).toHaveLength(1);
    expect(nodeCalls[0]?.[1]).toContain("--from-kit");
  });
});

describe("updateFromSource — kontrole przed klonem", () => {
  it("brudne drzewo kończy się błędem, zanim runner zostanie wywołany", async () => {
    await writeFile(join(dir, "notes.txt"), "roboczy\n");
    await expect(run()).rejects.toThrow(
      "Niezacommitowane zmiany w projekcie; zrób commit albo stash przed wa update",
    );
    expect(runner).not.toHaveBeenCalled();
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("brudne drzewo przy --dry-run nie blokuje delegacji", async () => {
    await writeFile(join(dir, "notes.txt"), "roboczy\n");
    const result = await run({ dryRun: true });
    expect(result).toEqual({ exitCode: 0 });
    expect(callsOf("node")).toHaveLength(1);
  });

  it("ta sama wersja kończy się kodem 0 bez klonowania i bez delegacji", async () => {
    const result = await run({ version: "0.1.0" });
    expect(result).toEqual({ exitCode: 0 });
    expect(log).toHaveBeenCalledWith("Projekt ma już wa-kit 0.1.0");
    expect(runner).not.toHaveBeenCalled();
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("starsza wersja docelowa kończy się błędem bez wywołania runnera", async () => {
    await expect(run({ version: "0.0.9" })).rejects.toThrow(
      "Projekt ma wa-kit 0.1.0, nowszą niż 0.0.9; wa update nie obniża wersji",
    );
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("updateFromSource — bundel z klonu kitu", () => {
  it("bundel z wa-kit 0.3.0 przy update 0.2.0 kończy się błędem, bez node, projekt bez zmian, katalog tymczasowy usunięty", async () => {
    const bundleKit = await cloneTag("0.2.0");
    await setKitVersion(bundleKit, "0.3.0");
    const before = await snapshotDir(dir, IGNORE);
    await expect(run({}, { bundleKitDir: bundleKit })).rejects.toThrow(
      "Bundel pochodzi z wa-kit 0.3.0, a aktualizacja prowadzi do 0.2.0",
    );
    expect(callsOf("node")).toEqual([]);
    expect(await snapshotDir(dir, IGNORE)).toEqual(before);
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("bundel z wa-kit 0.2.0 aktualizuje projekt w procesie, bez node", async () => {
    const bundleKit = await cloneTag("0.2.0");
    const result = await run({}, { bundleKitDir: bundleKit });
    expect(result).toEqual({ exitCode: 0 });
    expect(callsOf("node")).toEqual([]);
    expect(await readAuth()).toBe(UPDATED_AUTH);
    expect(await readdir(tmpRoot)).toEqual([]);
    const clones = callsOf("git").map((call) => [
      call[1][4],
      clonePathOf(call),
    ]);
    expect(clones).toHaveLength(2);
    expect(clones).toEqual(
      expect.arrayContaining([
        ["v0.1.0", expect.stringMatching(/\/wa-update-[^/]+\/base$/)],
        ["v0.2.0", expect.stringMatching(/\/wa-update-[^/]+\/target$/)],
      ]),
    );
  });
});

describe("updateFromSource — --from-kit", () => {
  it("z prawdziwym klonem 0.2.0 aktualizuje pliki w procesie, bez node, i sprząta katalog tymczasowy", async () => {
    const fromKit = await cloneTag("0.2.0");
    const result = await run({ fromKit }, { bundleKitDir: fromKit });
    expect(result).toEqual({ exitCode: 0 });
    expect(callsOf("node")).toEqual([]);
    expect(await readAuth()).toBe(UPDATED_AUTH);
    const { stdout } = await exec("git", ["status", "--porcelain"], {
      cwd: dir,
    });
    expect(stdout).toContain(AUTH_MODULE);
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("klon wskazany przez --from-kit w innej wersji niż docelowa kończy się błędem bez zmian w projekcie", async () => {
    const fromKit = await cloneTag("0.1.0");
    const before = await snapshotDir(dir, IGNORE);
    await expect(run({ fromKit }, { bundleKitDir: fromKit })).rejects.toThrow(
      /0\.1\.0.*0\.2\.0/,
    );
    expect(callsOf("node")).toEqual([]);
    expect(await snapshotDir(dir, IGNORE)).toEqual(before);
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it("--from-kit z --dry-run nie zmienia projektu i nie woła node", async () => {
    const fromKit = await cloneTag("0.2.0");
    const before = await snapshotDir(dir, IGNORE);
    const result = await run(
      { fromKit, dryRun: true },
      { bundleKitDir: fromKit },
    );
    expect(result).toEqual({ exitCode: 0 });
    expect(callsOf("node")).toEqual([]);
    expect(await snapshotDir(dir, IGNORE)).toEqual(before);
    expect(await readdir(tmpRoot)).toEqual([]);
  });
});
