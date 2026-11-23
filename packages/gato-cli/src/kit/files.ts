import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compareCodePoint } from "../compare.js";
import type { KitConfig } from "./kit-config.js";

const run = promisify(execFile);
const GIT_FATAL_EXIT_CODE = 128;
const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/;

export function globToRegExp(glob: string): RegExp {
  let source = "";
  let index = 0;
  while (index < glob.length) {
    if (glob.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 3;
    } else if (glob.startsWith("**", index)) {
      source += ".*";
      index += 2;
    } else if (glob[index] === "*") {
      source += "[^/]*";
      index += 1;
    } else {
      const char = glob[index] as string;
      source += REGEXP_SPECIAL.test(char) ? `\\${char}` : char;
      index += 1;
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchFiles(globs: string[], files: string[]): string[] {
  const patterns = globs.map(globToRegExp);
  return files
    .filter((file) => patterns.some((pattern) => pattern.test(file)))
    .sort(compareCodePoint);
}

export async function listKitFiles(kitDir: string): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await run("git", ["-C", kitDir, "ls-files", "-z"], {
      maxBuffer: 64 * 1024 * 1024,
    }));
  } catch (error) {
    if ((error as { code?: unknown }).code === GIT_FATAL_EXIT_CODE) {
      throw new Error(`${kitDir} nie jest repozytorium git`);
    }
    throw error;
  }
  return stdout.split("\0").filter(Boolean).sort(compareCodePoint);
}

export async function assemblableFiles(
  kitDir: string,
  config: KitConfig,
): Promise<string[]> {
  const files = await listKitFiles(kitDir);
  const excluded = new Set(
    matchFiles([...config.kitOnly, ...config.generatedFiles], files),
  );
  return files.filter((file) => !excluded.has(file));
}
