import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as protectTests from "./protect-tests.mjs";

const { isBlocked, isTestPath, readPhase } = protectTests;

const NEW_PHASE = join(".gato", "phase");
const LEGACY_PHASE = join(".superpowers", "phase");

const edit = (file_path) => ({ tool_name: "Edit", tool_input: { file_path } });

const hookScript = fileURLToPath(
  new URL("./protect-tests.mjs", import.meta.url),
);

const withCheckouts = (run) => {
  const root = mkdtempSync(join(tmpdir(), "protect tests "));
  const main = join(root, "main");
  const worktree = join(main, ".claude", "worktrees", "task");
  try {
    mkdirSync(join(main, ".git", "worktrees", "task"), { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(
      join(worktree, ".git"),
      `gitdir: ${join(main, ".git", "worktrees", "task")}\n`,
    );
    run({ main, worktree });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const withProjectDir = (run) => {
  const dir = mkdtempSync(join(tmpdir(), "protect tests "));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const writePhase = (checkout, phaseFile, phase) => {
  mkdirSync(dirname(join(checkout, phaseFile)), { recursive: true });
  writeFileSync(join(checkout, phaseFile), phase);
};

const enterImplementPhase = (checkout, phaseFile) =>
  writePhase(checkout, phaseFile, "implement\n");

const runHook = ({ sessionDir, cwd, filePath }) =>
  spawnSync(process.execPath, [hookScript], {
    cwd,
    input: JSON.stringify({ ...edit(filePath), cwd }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: sessionDir },
    timeout: 10_000,
  });

const runInProject = (dir, relativePath) =>
  runHook({ sessionDir: dir, cwd: dir, filePath: join(dir, relativePath) });

const phaseFileCases = [
  { phaseFile: NEW_PHASE, named: /\.gato\/phase/, label: ".gato/phase" },
  {
    phaseFile: LEGACY_PHASE,
    named: /\.superpowers\/phase/,
    label: "legacy .superpowers/phase",
  },
];

test("recognises unit, spec and e2e test paths", () => {
  for (const path of [
    "/repo/src/shared/lib/__tests__/env.test.ts",
    "src/features/x/components/form.test.tsx",
    "packages/cli/src/a.spec.mts",
    "e2e/core-auth.spec.ts",
    "/repo/e2e/helpers.ts",
    "C:\\repo\\src\\__tests__\\a.ts",
  ]) {
    assert.equal(isTestPath(path), true, path);
  }
});

test("leaves production code and lookalike names alone", () => {
  for (const path of [
    "src/shared/lib/env.ts",
    "src/features/testimonials/service.ts",
    "src/contest.ts",
    "src/latest.tsx",
    "docs/e2e-notes.md",
  ]) {
    assert.equal(isTestPath(path), false, path);
  }
});

test("blocks a test edit only in the implement phase", () => {
  const testEdit = edit("src/__tests__/a.test.ts");
  assert.equal(isBlocked(testEdit, "implement"), true);
  assert.equal(isBlocked(testEdit, "test"), false);
  assert.equal(isBlocked(testEdit, null), false);
  assert.equal(isBlocked(edit("src/a.ts"), "implement"), false);
  assert.equal(
    isBlocked({ tool_name: "Write", tool_input: {} }, "implement"),
    false,
  );
});

test("the phase file is .gato/phase and the legacy one is .superpowers/phase", () => {
  assert.equal(protectTests.PHASE_FILE, join(".gato", "phase"));
  assert.equal(protectTests.LEGACY_PHASE_FILE, join(".superpowers", "phase"));
  assert.equal(protectTests.IMPLEMENT_PHASE, "implement");
});

test("PHASE_FILES lists the new phase file first and the legacy one second", () => {
  assert.deepEqual(protectTests.PHASE_FILES, [
    join(".gato", "phase"),
    join(".superpowers", "phase"),
  ]);
});

test(
  "on posix the phase files are .gato/phase and .superpowers/phase",
  { skip: process.platform === "win32" },
  () => {
    assert.equal(protectTests.PHASE_FILE, ".gato/phase");
    assert.equal(protectTests.LEGACY_PHASE_FILE, ".superpowers/phase");
    assert.deepEqual(protectTests.PHASE_FILES, [
      ".gato/phase",
      ".superpowers/phase",
    ]);
  },
);

test("reads a trimmed phase from .gato/phase by default", () =>
  withProjectDir((dir) => {
    assert.equal(readPhase(dir), null);
    writePhase(dir, NEW_PHASE, "implement\n");
    assert.equal(readPhase(dir), "implement");
  }));

test("readPhase without a phase file argument ignores the legacy file", () =>
  withProjectDir((dir) => {
    enterImplementPhase(dir, LEGACY_PHASE);
    assert.equal(readPhase(dir), null);
  }));

test("readPhase reads the phase file passed as the second argument", () =>
  withProjectDir((dir) => {
    enterImplementPhase(dir, LEGACY_PHASE);
    assert.equal(readPhase(dir, LEGACY_PHASE), "implement");
    assert.equal(readPhase(dir, NEW_PHASE), null);
  }));

test("readPhase with the legacy file argument ignores .gato/phase", () =>
  withProjectDir((dir) => {
    writePhase(dir, NEW_PHASE, "  implement \n");
    assert.equal(readPhase(dir, LEGACY_PHASE), null);
    assert.equal(readPhase(dir, NEW_PHASE), "implement");
  }));

test("the CLI exits 0 on a test edit when neither phase file exists", () =>
  withProjectDir((dir) => {
    const result = runInProject(dir, "src/__tests__/a.test.ts");
    assert.equal(result.status, 0);
    assert.equal(result.stderr.toString(), "");
  }));

test("the CLI exits 2 on a test edit when .gato/phase is implement and names that file", () =>
  withProjectDir((dir) => {
    enterImplementPhase(dir, NEW_PHASE);
    const blocked = runInProject(dir, "src/__tests__/a.test.ts");
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /tests are read-only/);
    assert.match(blocked.stderr.toString(), /\.gato\/phase/);
    assert.doesNotMatch(blocked.stderr.toString(), /\.superpowers/);
  }));

test("the CLI exits 0 on a production edit when .gato/phase is implement", () =>
  withProjectDir((dir) => {
    enterImplementPhase(dir, NEW_PHASE);
    assert.equal(runInProject(dir, "src/a.ts").status, 0);
  }));

test("the CLI exits 2 on a test edit when only the legacy .superpowers/phase is implement and names that file", () =>
  withProjectDir((dir) => {
    enterImplementPhase(dir, LEGACY_PHASE);
    const blocked = runInProject(dir, "src/__tests__/a.test.ts");
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /tests are read-only/);
    assert.match(blocked.stderr.toString(), /\.superpowers\/phase/);
    assert.doesNotMatch(blocked.stderr.toString(), /\.gato/);
  }));

test("the CLI exits 0 on a production edit when only the legacy .superpowers/phase is implement", () =>
  withProjectDir((dir) => {
    enterImplementPhase(dir, LEGACY_PHASE);
    assert.equal(runInProject(dir, "src/a.ts").status, 0);
  }));

test("the CLI exits 0 on a test edit when .gato/phase holds a phase other than implement", () =>
  withProjectDir((dir) => {
    writePhase(dir, NEW_PHASE, "test\n");
    assert.equal(runInProject(dir, "src/__tests__/a.test.ts").status, 0);
  }));

test("the CLI exits 0 on a test edit when the legacy .superpowers/phase holds a phase other than implement", () =>
  withProjectDir((dir) => {
    writePhase(dir, LEGACY_PHASE, "test\n");
    assert.equal(runInProject(dir, "src/__tests__/a.test.ts").status, 0);
  }));

test("the CLI blocks a test edit when .gato/phase is test but the legacy .superpowers/phase is implement", () =>
  withProjectDir((dir) => {
    writePhase(dir, NEW_PHASE, "test\n");
    enterImplementPhase(dir, LEGACY_PHASE);
    const blocked = runInProject(dir, "src/__tests__/a.test.ts");
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /\.superpowers\/phase/);
  }));

test("the CLI blocks a test edit when the legacy .superpowers/phase is test but .gato/phase is implement", () =>
  withProjectDir((dir) => {
    writePhase(dir, LEGACY_PHASE, "test\n");
    enterImplementPhase(dir, NEW_PHASE);
    const blocked = runInProject(dir, "src/__tests__/a.test.ts");
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /\.gato\/phase/);
  }));

test("the CLI names only .gato/phase when both phase files are implement", () =>
  withProjectDir((dir) => {
    enterImplementPhase(dir, NEW_PHASE);
    enterImplementPhase(dir, LEGACY_PHASE);
    const blocked = runInProject(dir, "src/__tests__/a.test.ts");
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /tests are read-only/);
    assert.match(blocked.stderr.toString(), /\.gato\/phase/);
    assert.doesNotMatch(blocked.stderr.toString(), /\.superpowers/);
  }));

for (const { phaseFile, named, label } of phaseFileCases) {
  test(`the CLI blocks a worktree test edit when that worktree has ${label} = implement and the session started in the main checkout`, () =>
    withCheckouts(({ main, worktree }) => {
      enterImplementPhase(worktree, phaseFile);
      const blocked = runHook({
        sessionDir: main,
        cwd: main,
        filePath: join(worktree, "src/__tests__/a.test.ts"),
      });
      assert.equal(blocked.status, 2);
      assert.match(blocked.stderr.toString(), /tests are read-only/);
      assert.match(blocked.stderr.toString(), named);
    }));

  test(`the CLI allows a production edit in a worktree that has ${label} = implement`, () =>
    withCheckouts(({ main, worktree }) => {
      enterImplementPhase(worktree, phaseFile);
      assert.equal(
        runHook({
          sessionDir: main,
          cwd: main,
          filePath: join(worktree, "src/a.ts"),
        }).status,
        0,
      );
    }));

  test(`the CLI allows a main checkout test edit when only a nested worktree has ${label} = implement`, () =>
    withCheckouts(({ main, worktree }) => {
      enterImplementPhase(worktree, phaseFile);
      assert.equal(
        runHook({
          sessionDir: main,
          cwd: main,
          filePath: join(main, "src/__tests__/a.test.ts"),
        }).status,
        0,
      );
    }));

  test(`the CLI blocks a worktree test edit when the session start directory has ${label} = implement`, () =>
    withCheckouts(({ main, worktree }) => {
      enterImplementPhase(main, phaseFile);
      const blocked = runHook({
        sessionDir: main,
        cwd: worktree,
        filePath: join(worktree, "src/__tests__/a.test.ts"),
      });
      assert.equal(blocked.status, 2);
      assert.match(blocked.stderr.toString(), /tests are read-only/);
      assert.match(blocked.stderr.toString(), named);
    }));

  test(`the CLI allows a worktree test edit when only the enclosing main checkout has ${label} = implement and the session started in the worktree`, () =>
    withCheckouts(({ main, worktree }) => {
      enterImplementPhase(main, phaseFile);
      const result = runHook({
        sessionDir: worktree,
        cwd: worktree,
        filePath: join(worktree, "src/__tests__/a.test.ts"),
      });
      assert.equal(result.status, 0);
    }));

  test(`the CLI blocks a new test file reached through a directory symlink into a worktree that has ${label} = implement`, () =>
    withCheckouts(({ main, worktree }) => {
      enterImplementPhase(worktree, phaseFile);
      mkdirSync(join(worktree, "src"));
      const link = join(main, "..", "src-link");
      symlinkSync(join(worktree, "src"), link, "junction");
      const blocked = runHook({
        sessionDir: main,
        cwd: main,
        filePath: join(link, "__tests__/a.test.ts"),
      });
      assert.equal(blocked.status, 2);
      assert.match(blocked.stderr.toString(), /tests are read-only/);
      assert.match(blocked.stderr.toString(), named);
    }));
}
