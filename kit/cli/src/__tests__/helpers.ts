import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const created: string[] = [];

export async function makeTempDir(prefix = "wa-kit-test-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export async function makeKitRepo(name: string): Promise<string> {
  const dir = await makeTempDir(`wa-kit-${name}-`);
  await cp(join(fixturesDir, name), dir, { recursive: true });
  await run("git", ["-C", dir, "init", "-q"]);
  await run("git", ["-C", dir, "config", "user.name", "Test"]);
  await run("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  await run("git", ["-C", dir, "add", "-A"]);
  return dir;
}

export async function removeTempDirs(): Promise<void> {
  await Promise.all(
    created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
}

export const IGNORE = [".git", "node_modules", ".env"];

export async function snapshotDir(
  dir: string,
  ignore: string[],
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  async function walk(relative: string): Promise<void> {
    const entries = await readdir(join(dir, relative), { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else snapshot[path] = await readFile(join(dir, path), "utf8");
    }
  }
  await walk("");
  return snapshot;
}

async function commitAll(dir: string, message: string): Promise<void> {
  await run("git", ["-C", dir, "add", "-A"]);
  await run("git", ["-C", dir, "commit", "-q", "--no-verify", "-m", message]);
}

async function tag(dir: string, version: string): Promise<void> {
  await run("git", ["-C", dir, "tag", "-a", `v${version}`, "-m", version]);
}

export async function makeTaggedKit(
  changes: (kitDir: string) => Promise<void>,
): Promise<string> {
  const kitDir = await makeKitRepo("kit");
  await commitAll(kitDir, "v0.1.0");
  await tag(kitDir, "0.1.0");
  await changes(kitDir);
  const configPath = join(kitDir, "kit", "kit.json");
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    config.replace('"version": "0.1.0"', '"version": "0.2.0"'),
  );
  await commitAll(kitDir, "v0.2.0");
  await tag(kitDir, "0.2.0");
  return kitDir;
}

export async function createProjectFromTag(
  kitDir: string,
  name: string,
  modules: string[],
): Promise<string> {
  const clone = join(await makeTempDir("wa-kit-clone-"), "kit");
  await run("git", ["clone", "-q", "--branch", "v0.1.0", kitDir, clone]);
  const target = await createFromKit(clone, name, modules);
  await run("git", ["-C", target, "init", "-q"]);
  await run("git", ["-C", target, "config", "user.name", "Test"]);
  await run("git", ["-C", target, "config", "user.email", "test@example.com"]);
  await commitAll(target, "initial");
  return target;
}

export async function createProject(
  name: string,
  modules: string[],
  parent?: string,
): Promise<string> {
  return createFromKit(await makeKitRepo("kit"), name, modules, parent);
}

async function createFromKit(
  kitDir: string,
  name: string,
  modules: string[],
  parent?: string,
): Promise<string> {
  const { create } = await import("../commands/create.js");
  const target = join(await makeTempDir(), parent ?? "", name);
  await create({
    target,
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
    },
    log: () => {},
  });
  return target;
}
