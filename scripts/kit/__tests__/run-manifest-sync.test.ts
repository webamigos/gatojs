// @vitest-environment node
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runManifestSync } from "../run-manifest-sync";

const GIT_TIMEOUT = 30_000;

const UPLOADS_AT_BASE = `{
  "name": "uploads",
  "version": "0.2.6",
  "description": "Organization files on disk or in S3 storage",
  "requires": [],
  "files": [
    "prisma/schema/uploads.prisma",
    "src/features/uploads/**"
  ],
  "dependencies": {
    "file-type": "^22.3.0",
    "sharp": "^0.35.5"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [
    { "model": "Organization", "field": "uploads Upload[]" }
  ],
  "compose": null,
  "workspaces": []
}
`;

const UPLOADS_SYNCED = `{
  "name": "uploads",
  "version": "0.2.7",
  "description": "Organization files on disk or in S3 storage",
  "requires": [],
  "files": [
    "prisma/schema/uploads.prisma",
    "src/features/uploads/**"
  ],
  "dependencies": {
    "file-type": "^22.3.0",
    "sharp": "^0.35.6"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [
    { "model": "Organization", "field": "uploads Upload[]" }
  ],
  "compose": null,
  "workspaces": []
}
`;

const ROOT_AT_BASE = `{
  "name": "gatojs",
  "version": "0.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "dependencies": {
    "file-type": "^22.3.0",
    "sharp": "^0.35.5",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "vitest": "^4.1.2"
  }
}
`;

const ROOT_WITH_NEW_SHARP = `{
  "name": "gatojs",
  "version": "0.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "dependencies": {
    "file-type": "^22.3.0",
    "sharp": "^0.35.6",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "vitest": "^4.1.2"
  }
}
`;

const ENV_PACKAGE = `{
  "name": "@gatojs/env",
  "version": "0.1.0",
  "private": true,
  "description": "Typed, validated environment for GatoJS projects",
  "dependencies": {
    "zod": "^4.3.6"
  }
}
`;

let repoDir = "";
let baseSha = "";

function git(...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
    { cwd: repoDir, encoding: "utf8" },
  ).trim();
}

function writeRepoFile(relativePath: string, text: string) {
  const target = path.join(repoDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoDir, relativePath), "utf8");
}

function recordingRunWa(onCall: (args: string[]) => void = () => {}) {
  const calls: string[][] = [];
  const runWa = async (args: string[]) => {
    calls.push(args);
    onCall(args);
  };
  return { calls, runWa };
}

beforeEach(() => {
  repoDir = mkdtempSync(path.join(tmpdir(), "manifest-sync-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test Writer");
  git("config", "user.email", "test-writer@example.com");
  writeRepoFile("package.json", ROOT_AT_BASE);
  writeRepoFile("kit/modules/uploads.json", UPLOADS_AT_BASE);
  writeRepoFile("packages/env/package.json", ENV_PACKAGE);
  git("add", "-A");
  git("commit", "-q", "-m", "chore: base");
  baseSha = git("rev-parse", "HEAD");
  writeRepoFile("package.json", ROOT_WITH_NEW_SHARP);
  git("commit", "-q", "-am", "chore(deps): bump sharp");
}, GIT_TIMEOUT);

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe("runManifestSync", () => {
  it(
    "in write mode writes the manifest, then calls wa generate and wa kit sync, and a second call changes nothing",
    async () => {
      const contentAtGenerate: string[] = [];
      const { calls, runWa } = recordingRunWa((args) => {
        if (args[0] === "generate") {
          contentAtGenerate.push(readRepoFile("kit/modules/uploads.json"));
        }
      });

      const first = await runManifestSync({
        repoDir,
        base: baseSha,
        check: false,
        runWa,
      });

      expect(first.changed).toBe(true);
      expect(readRepoFile("kit/modules/uploads.json")).toBe(UPLOADS_SYNCED);
      expect(calls).toEqual([["generate"], ["kit", "sync"]]);
      expect(contentAtGenerate).toEqual([UPLOADS_SYNCED]);
      expect(first.result.bumps).toEqual([
        {
          module: "uploads",
          path: "kit/modules/uploads.json",
          from: "0.2.6",
          to: "0.2.7",
        },
      ]);
      expect(readRepoFile("package.json")).toBe(ROOT_WITH_NEW_SHARP);
      expect(readRepoFile("packages/env/package.json")).toBe(ENV_PACKAGE);

      const second = await runManifestSync({
        repoDir,
        base: baseSha,
        check: false,
        runWa: recordingRunWa().runWa,
      });

      expect(second.changed).toBe(false);
      expect(second.result.files).toEqual([]);
      expect(readRepoFile("kit/modules/uploads.json")).toBe(UPLOADS_SYNCED);
    },
    GIT_TIMEOUT,
  );

  it(
    "accepts a branch name as the base and decides the bump against the merge base",
    async () => {
      git("branch", "base-line", baseSha);
      const { runWa } = recordingRunWa();

      const outcome = await runManifestSync({
        repoDir,
        base: "base-line",
        check: false,
        runWa,
      });

      expect(outcome.changed).toBe(true);
      expect(readRepoFile("kit/modules/uploads.json")).toBe(UPLOADS_SYNCED);
    },
    GIT_TIMEOUT,
  );

  it(
    "in check mode writes no files, does not call wa and reports changed: true",
    async () => {
      const { calls, runWa } = recordingRunWa();

      const outcome = await runManifestSync({
        repoDir,
        base: baseSha,
        check: true,
        runWa,
      });

      expect(outcome.changed).toBe(true);
      expect(calls).toEqual([]);
      expect(readRepoFile("kit/modules/uploads.json")).toBe(UPLOADS_AT_BASE);
      expect(outcome.result.updates).toEqual([
        {
          module: "uploads",
          path: "kit/modules/uploads.json",
          section: "dependencies",
          name: "sharp",
          from: "^0.35.5",
          to: "^0.35.6",
        },
      ]);
    },
    GIT_TIMEOUT,
  );
});
