import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
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
