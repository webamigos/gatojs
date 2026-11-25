import fs from "node:fs";
import path from "node:path";
import {
  agentMarkdownFiles,
  existingFiles,
  readRepoFile,
  unique,
} from "./repo-files";

const CANDIDATE = /`([^`]+)`|\]\(([^)]+)\)/g;

const REPO_DIRECTORIES = [
  "src/",
  "prisma/",
  "scripts/",
  "e2e/",
  ".claude/",
  ".github/",
  "kit/",
  "docs/",
];

const KIT_ONLY_DIRECTORIES = ["docs/", "kit/"];

const ROOT_FILE =
  /^[\w.-]+\.(md|json|jsonc|ya?ml|toml|example)$|^[\w.-]+\.config\.(ts|mts|js|mjs|cjs)$/;

const PATTERN_MARKERS = /[<*{]/;

const OPTIONAL_COMPANION_FILES = new Set([
  "AGENTS.project.md",
  "mutation-gate.project.json",
]);

const CITING_FILES = ["AGENTS.md", "CLAUDE.md"];

function withoutAnchor(candidate: string): string {
  return candidate.split("#")[0];
}

function isRepoPath(candidate: string): boolean {
  if (/\s/.test(candidate)) {
    return false;
  }
  return (
    REPO_DIRECTORIES.some((directory) => candidate.startsWith(directory)) ||
    ROOT_FILE.test(candidate)
  );
}

function isCheckable(citedPath: string): boolean {
  return (
    !KIT_ONLY_DIRECTORIES.some((directory) =>
      citedPath.startsWith(directory),
    ) &&
    !PATTERN_MARKERS.test(citedPath) &&
    !OPTIONAL_COMPANION_FILES.has(citedPath)
  );
}

export function extractCitedPaths(markdown: string): string[] {
  const candidates = [...markdown.matchAll(CANDIDATE)].map((match) =>
    withoutAnchor(match[1] ?? match[2]),
  );
  return unique(candidates.filter(isRepoPath));
}

export function findMissingCitedPaths(
  markdown: string,
  exists: (citedPath: string) => boolean,
): string[] {
  return extractCitedPaths(markdown).filter(
    (citedPath) => isCheckable(citedPath) && !exists(citedPath),
  );
}

export function checkCitedPaths(root: string): string[] {
  const exists = (citedPath: string) =>
    fs.existsSync(path.join(root, citedPath));
  const files = [
    ...existingFiles(root, CITING_FILES),
    ...agentMarkdownFiles(root),
  ];
  return files.flatMap((file) =>
    findMissingCitedPaths(readRepoFile(root, file), exists).map(
      (citedPath) => `${file}: ${citedPath}`,
    ),
  );
}
