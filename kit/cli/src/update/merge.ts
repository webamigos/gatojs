import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { stripRegions } from "../assemble/hash.js";
import { REGION_FILES } from "../generate/targets.js";

const run = promisify(execFile);
const MAX_CONFLICT_EXIT_CODE = 127;

export type MergeResult =
  { content: Buffer; conflicts: number } | { binary: true };

type MergeSides = { base: Buffer; ours: Buffer; theirs: Buffer };

type ExecFileFailure = { code?: unknown; stdout?: unknown; stderr: Buffer };

function prepareSides(path: string, sides: MergeSides): MergeSides {
  if (!REGION_FILES.includes(path)) {
    return sides;
  }
  const strip = (content: Buffer) =>
    Buffer.from(stripRegions(content.toString("utf8")));
  return {
    base: strip(sides.base),
    ours: strip(sides.ours),
    theirs: strip(sides.theirs),
  };
}

export async function mergeFile(input: {
  path: string;
  base: Buffer;
  ours: Buffer;
  theirs: Buffer;
  labels: { ours: string; base: string; theirs: string };
}): Promise<MergeResult> {
  if ([input.base, input.ours, input.theirs].some((side) => side.includes(0))) {
    return { binary: true };
  }
  const sides = prepareSides(input.path, input);
  const dir = await mkdtemp(join(tmpdir(), "wa-merge-"));
  try {
    const oursFile = join(dir, "ours");
    const baseFile = join(dir, "base");
    const theirsFile = join(dir, "theirs");
    await Promise.all([
      writeFile(oursFile, sides.ours),
      writeFile(baseFile, sides.base),
      writeFile(theirsFile, sides.theirs),
    ]);
    const args = [
      "merge-file",
      "-p",
      "--diff3",
      "-L",
      input.labels.ours,
      "-L",
      input.labels.base,
      "-L",
      input.labels.theirs,
      oursFile,
      baseFile,
      theirsFile,
    ];
    try {
      const { stdout } = await run("git", args, {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
      });
      return { content: stdout, conflicts: 0 };
    } catch (error) {
      const failure = error as ExecFileFailure;
      if (
        typeof failure.code === "number" &&
        failure.code <= MAX_CONFLICT_EXIT_CODE &&
        Buffer.isBuffer(failure.stdout)
      ) {
        return { content: failure.stdout, conflicts: failure.code };
      }
      const stderr = failure.stderr.toString("utf8").trim();
      throw new Error(`git merge-file: ${stderr || String(error)}`, {
        cause: error,
      });
    }
  } finally {
    await rm(dir, { recursive: true });
  }
}
