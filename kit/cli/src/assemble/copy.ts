import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { KitConfig } from "../kit/kit-config.js";
import { fileHash } from "./hash.js";
import { applyPlaceholders } from "./placeholders.js";
import type { ProjectNames } from "./project-names.js";

const PERMISSION_BITS = 0o777;

export async function copyFiles(input: {
  kitDir: string;
  projectDir: string;
  files: string[];
  config: KitConfig;
  names: ProjectNames;
}): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const file of input.files) {
    const source = join(input.kitDir, file);
    const destination = join(input.projectDir, file);
    const original = await readFile(source);
    const text = original.toString("utf8");
    const content = applyPlaceholders(file, text, input.config, input.names);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content === text ? original : content);
    await chmod(destination, (await stat(source)).mode & PERMISSION_BITS);
    hashes[file] = fileHash(file, content, input.config);
  }
  return hashes;
}
