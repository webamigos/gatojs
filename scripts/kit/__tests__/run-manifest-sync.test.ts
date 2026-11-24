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

const CORE_AT_BASE = `{
  "name": "core",
  "version": "0.13.0",
  "description": "GatoJS core: auth, organizations, users, account, dashboard",
  "requires": [],
  "files": [
    "package.json",
    "packages/env/**",
    "scripts/**"
  ],
  "dependencies": {
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "vitest": "^4.1.2"
  },
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const CORE_BUMPED = `{
  "name": "core",
  "version": "0.13.1",
  "description": "GatoJS core: auth, organizations, users, account, dashboard",
  "requires": [],
  "files": [
    "package.json",
    "packages/env/**",
    "scripts/**"
  ],
  "dependencies": {
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "vitest": "^4.1.2"
  },
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const ENV_PACKAGE_WITH_NEW_ZOD = `{
  "name": "@gatojs/env",
  "version": "0.1.0",
  "private": true,
  "description": "Typed, validated environment for GatoJS projects",
  "dependencies": {
    "zod": "^4.4.0"
  }
}
`;

const DOCS_AT_BASE = `{
  "name": "docs",
  "version": "0.1.0",
  "description": "Documentation site",
  "requires": [],
  "files": [
    "apps/docs/**"
  ],
  "dependencies": {},
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const DOCS_BUMPED = `{
  "name": "docs",
  "version": "0.1.1",
  "description": "Documentation site",
  "requires": [],
  "files": [
    "apps/docs/**"
  ],
  "dependencies": {},
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const DOCS_APP_AT_BASE = `{
  "name": "@gatojs/docs",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "next": "16.4.6"
  }
}
`;

const DOCS_APP_WITH_NEW_NEXT = `{
  "name": "@gatojs/docs",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "next": "16.4.7"
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

function commitAll(message: string): string {
  git("add", "-A");
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
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

  it(
    "a changed workspace package under packages/ bumps the owning manifest in the file",
    async () => {
      writeRepoFile("kit/modules/core.json", CORE_AT_BASE);
      const ownerBase = commitAll("chore: add core manifest");
      writeRepoFile("packages/env/package.json", ENV_PACKAGE_WITH_NEW_ZOD);
      commitAll("chore(deps): bump zod in env");

      const outcome = await runManifestSync({
        repoDir,
        base: ownerBase,
        check: false,
        runWa: recordingRunWa().runWa,
      });

      expect(outcome.changed).toBe(true);
      expect(readRepoFile("kit/modules/core.json")).toBe(CORE_BUMPED);
      expect(readRepoFile("packages/env/package.json")).toBe(
        ENV_PACKAGE_WITH_NEW_ZOD,
      );
    },
    GIT_TIMEOUT,
  );

  it(
    "a changed workspace package under apps/ bumps the owning manifest in the file",
    async () => {
      writeRepoFile("kit/modules/docs.json", DOCS_AT_BASE);
      writeRepoFile("apps/docs/package.json", DOCS_APP_AT_BASE);
      const ownerBase = commitAll("chore: add docs app");
      writeRepoFile("apps/docs/package.json", DOCS_APP_WITH_NEW_NEXT);
      commitAll("chore(deps): bump next in docs");

      const outcome = await runManifestSync({
        repoDir,
        base: ownerBase,
        check: false,
        runWa: recordingRunWa().runWa,
      });

      expect(outcome.changed).toBe(true);
      expect(readRepoFile("kit/modules/docs.json")).toBe(DOCS_BUMPED);
      expect(readRepoFile("apps/docs/package.json")).toBe(
        DOCS_APP_WITH_NEW_NEXT,
      );
    },
    GIT_TIMEOUT,
  );

  it(
    "ignores a non-JSON file in kit/modules",
    async () => {
      writeRepoFile("kit/modules/README.md", "# Module manifests\n");
      commitAll("docs: describe module manifests");

      const outcome = await runManifestSync({
        repoDir,
        base: baseSha,
        check: false,
        runWa: recordingRunWa().runWa,
      });

      expect(outcome.changed).toBe(true);
      expect(readRepoFile("kit/modules/uploads.json")).toBe(UPLOADS_SYNCED);
      expect(readRepoFile("kit/modules/README.md")).toBe(
        "# Module manifests\n",
      );
    },
    GIT_TIMEOUT,
  );

  it(
    "ignores a workspace directory without package.json",
    async () => {
      writeRepoFile("packages/empty/.gitkeep", "");
      commitAll("chore: add an empty package directory");

      const outcome = await runManifestSync({
        repoDir,
        base: baseSha,
        check: false,
        runWa: recordingRunWa().runWa,
      });

      expect(outcome.changed).toBe(true);
      expect(readRepoFile("kit/modules/uploads.json")).toBe(UPLOADS_SYNCED);
    },
    GIT_TIMEOUT,
  );

  it(
    "rejects when wa generate fails and does not call wa kit sync",
    async () => {
      const calls: string[][] = [];
      const runWa = async (args: string[]) => {
        calls.push(args);
        if (args[0] === "generate") {
          throw new Error("wa generate failed");
        }
      };

      await expect(
        runManifestSync({ repoDir, base: baseSha, check: false, runWa }),
      ).rejects.toThrow("wa generate failed");
      expect(calls).toEqual([["generate"]]);
    },
    GIT_TIMEOUT,
  );

  it(
    "rejects a base ref that does not exist",
    async () => {
      const { calls, runWa } = recordingRunWa();

      await expect(
        runManifestSync({
          repoDir,
          base: "origin/does-not-exist",
          check: false,
          runWa,
        }),
      ).rejects.toThrow();
      expect(calls).toEqual([]);
      expect(readRepoFile("kit/modules/uploads.json")).toBe(UPLOADS_AT_BASE);
    },
    GIT_TIMEOUT,
  );
});
