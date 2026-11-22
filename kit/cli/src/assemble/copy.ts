import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { KitConfig } from "../kit/kit-config.js";
import { fileHash } from "./hash.js";
import { applyPlaceholders } from "./placeholders.js";
import type { ProjectNames } from "./project-names.js";

const PERMISSION_BITS = 0o777;

export async function readAssembledFile(input: {
  kitDir: string;
  file: string;
  config: KitConfig;
  names: ProjectNames;
}): Promise<{ content: Buffer; mode: number }> {
  const source = join(input.kitDir, input.file);
  const original = await readFile(source);
  const text = original.toString("utf8");
  const replaced = applyPlaceholders(
    input.file,
    text,
    input.config,
    input.names,
  );
  return {
    content: replaced === text ? original : Buffer.from(replaced),
    mode: (await stat(source)).mode & PERMISSION_BITS,
  };
}

export async function copyFiles(input: {
  kitDir: string;
  projectDir: string;
  files: string[];
  config: KitConfig;
  names: ProjectNames;
}): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const file of input.files) {
    const destination = join(input.projectDir, file);
    const { content, mode } = await readAssembledFile({ ...input, file });
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
    await chmod(destination, mode);
    hashes[file] = fileHash(file, content, input.config);
  }
  return hashes;
}
