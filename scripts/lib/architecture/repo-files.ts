import fs from "node:fs";
import path from "node:path";

const SKIPPED_DIRECTORY = "node_modules";

export function toRepoPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

export function listFiles(
  root: string,
  directory: string,
  accept: (repoPath: string) => boolean,
): string[] {
  const start = path.join(root, directory);
  if (!fs.existsSync(start)) {
    return [];
  }
  const found: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const repoPath = toRepoPath(root, full);
      if (entry.isDirectory()) {
        if (entry.name !== SKIPPED_DIRECTORY) {
          visit(full);
        }
      } else if (accept(repoPath)) {
        found.push(repoPath);
      }
    }
  };
  visit(start);
  return found.sort();
}

export function existingFiles(
  root: string,
  files: readonly string[],
): string[] {
  return files.filter((file) => fs.existsSync(path.join(root, file)));
}

export function readRepoFile(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8");
}

export function agentMarkdownFiles(root: string): string[] {
  return listFiles(root, ".claude", (file) => file.endsWith(".md"));
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
