import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PHASE_FILE, isBlocked, isTestPath, readPhase } from "./protect-tests.mjs";

const edit = (file_path) => ({ tool_name: "Edit", tool_input: { file_path } });

const hookScript = fileURLToPath(new URL("./protect-tests.mjs", import.meta.url));

const withCheckouts = (run) => {
  const root = mkdtempSync(join(tmpdir(), "protect tests "));
  const main = join(root, "main");
  const worktree = join(main, ".claude", "worktrees", "task");
  try {
    mkdirSync(join(main, ".git", "worktrees", "task"), { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(main, ".git", "worktrees", "task")}\n`);
    run({ main, worktree });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const enterImplementPhase = (checkout) => {
  mkdirSync(join(checkout, ".superpowers"));
  writeFileSync(join(checkout, ".superpowers", "phase"), "implement\n");
};

const runHook = ({ sessionDir, cwd, filePath }) =>
  spawnSync(process.execPath, [hookScript], {
    cwd,
    input: JSON.stringify({ ...edit(filePath), cwd }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: sessionDir },
    timeout: 10_000,
  });

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
  assert.equal(isBlocked({ tool_name: "Write", tool_input: {} }, "implement"), false);
});

test("reads a trimmed phase from the project directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "protect-tests-"));
  try {
    assert.equal(readPhase(dir), null);
    mkdirSync(join(dir, ".superpowers"));
    writeFileSync(join(dir, PHASE_FILE), "implement\n");
    assert.equal(readPhase(dir), "implement");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI exits 2 on a test edit in the implement phase and 0 otherwise", () => {
  const dir = mkdtempSync(join(tmpdir(), "protect tests "));
  const hook = fileURLToPath(new URL("./protect-tests.mjs", import.meta.url));
  const run = (file_path) =>
    spawnSync(process.execPath, [hook], {
      input: JSON.stringify(edit(join(dir, file_path))),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
  try {
    assert.equal(run("src/__tests__/a.test.ts").status, 0);
    mkdirSync(join(dir, ".superpowers"));
    writeFileSync(join(dir, PHASE_FILE), "implement");
    const blocked = run("src/__tests__/a.test.ts");
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /tylko do odczytu/);
    assert.equal(run("src/a.ts").status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI blocks a worktree test edit when that worktree is in the implement phase and the session started in the main checkout", () =>
  withCheckouts(({ main, worktree }) => {
    enterImplementPhase(worktree);
    const blocked = runHook({ sessionDir: main, cwd: main, filePath: join(worktree, "src/__tests__/a.test.ts") });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /tylko do odczytu/);
  }));

test("the CLI allows a production edit in a worktree that is in the implement phase", () =>
  withCheckouts(({ main, worktree }) => {
    enterImplementPhase(worktree);
    assert.equal(runHook({ sessionDir: main, cwd: main, filePath: join(worktree, "src/a.ts") }).status, 0);
  }));

test("the CLI allows a main checkout test edit when only a nested worktree is in the implement phase", () =>
  withCheckouts(({ main, worktree }) => {
    enterImplementPhase(worktree);
    assert.equal(runHook({ sessionDir: main, cwd: main, filePath: join(main, "src/__tests__/a.test.ts") }).status, 0);
  }));

test("the CLI blocks a worktree test edit when the session start directory is in the implement phase", () =>
  withCheckouts(({ main, worktree }) => {
    enterImplementPhase(main);
    const blocked = runHook({ sessionDir: main, cwd: worktree, filePath: join(worktree, "src/__tests__/a.test.ts") });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /tylko do odczytu/);
  }));

test("the CLI allows a worktree test edit when only the enclosing main checkout is in the implement phase and the session started in the worktree", () =>
  withCheckouts(({ main, worktree }) => {
    enterImplementPhase(main);
    const result = runHook({
      sessionDir: worktree,
      cwd: worktree,
      filePath: join(worktree, "src/__tests__/a.test.ts"),
    });
    assert.equal(result.status, 0);
  }));

test("the CLI blocks a new test file reached through a directory symlink into a worktree that is in the implement phase", () =>
  withCheckouts(({ main, worktree }) => {
    enterImplementPhase(worktree);
    mkdirSync(join(worktree, "src"));
    const link = join(main, "..", "src-link");
    symlinkSync(join(worktree, "src"), link, "dir");
    const blocked = runHook({ sessionDir: main, cwd: main, filePath: join(link, "__tests__/a.test.ts") });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr.toString(), /tylko do odczytu/);
  }));
