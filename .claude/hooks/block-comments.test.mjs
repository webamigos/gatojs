import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { check } from "./block-comments.mjs";

const edit = (old_string, new_string, file_path = "apps/mcp/src/x.ts") => ({
  tool_name: "Edit",
  tool_input: { file_path, old_string, new_string },
});

test("blocks a new line comment", () => {
  assert.equal(check(edit("a();", "// call a\na();")).length, 1);
});

test("blocks a trailing and a block comment", () => {
  assert.equal(check(edit("", "a(); // go\n/** Docs. */\nb();")).length, 2);
});

test("keeps comments the edit only moves", () => {
  assert.deepEqual(check(edit("// kept\na();", "b();\n// kept\na();")), []);
});

test("ignores URLs and slashes inside strings", () => {
  assert.deepEqual(check(edit("", 'const u = "https://x.io/*a";')), []);
});

test("allows required markers and WHY", () => {
  const markers = [
    "// @vitest-environment jsdom",
    "// cache-scope: all — admin sweep",
    "// @ts-expect-error wrong on purpose",
    "// eslint-disable-next-line no-console",
    "// WHY: rejestr.io bills retries too",
  ].join("\n");
  assert.deepEqual(check(edit("", markers)), []);
});

test("allows a WHY that wraps onto up to three lines", () => {
  const why = "// WHY: rejestr.io bills retries too,\n// so a retry needs its own\n// budget check.\nretry();";
  assert.deepEqual(check(edit("", why)), []);
  const block = "/* WHY: rejestr.io bills retries too,\n   so a retry needs its own check. */\nretry();";
  assert.deepEqual(check(edit("", block)), []);
});

test("blocks a WHY past three lines and a comment after it", () => {
  const long = "// WHY: one\n// two\n// three\n// four\nx();\n// after";
  assert.deepEqual(check(edit("", long)), ["// four", "// after"]);
});

test("a new WHY right after another starts its own count", () => {
  const two = "// WHY: one\n// two\n// three\n// WHY: another\n// reason\nx();";
  assert.deepEqual(check(edit("", two)), []);
});

test("allows bundler directives", () => {
  assert.deepEqual(check(edit("", "path.join(/*turbopackIgnore: true*/ dir);")), []);
});

test("skips non-code and generated files", () => {
  assert.deepEqual(check(edit("", "// x", "README.md")), []);
  assert.deepEqual(check(edit("", "// x", "apps/admin/src/components/ui/button.tsx")), []);
});

test("checks a new file written whole", () => {
  const write = { tool_name: "Write", tool_input: { file_path: "/nonexistent/y.ts", content: "// hi\nx();" } };
  assert.equal(check(write).length, 1);
});

test("blocks a changed inner line of a block comment whose delimiters stay", () => {
  const before = "/*\n  old text\n*/\nx();";
  const after = "/*\n  new text\n*/\nx();";
  assert.deepEqual(check(edit(before, after)), ["new text"]);
});

test("the CLI exits 2 on a comment and 0 without one, from a path with a space", () => {
  const root = mkdtempSync(join(tmpdir(), "hook-"));
  const dir = join(root, "dir with space");
  mkdirSync(dir);
  const hook = join(dir, "block-comments.mjs");
  copyFileSync(fileURLToPath(new URL("./block-comments.mjs", import.meta.url)), hook);
  const run = (new_string) =>
    spawnSync(process.execPath, [hook], { input: JSON.stringify(edit("x();", new_string)), encoding: "utf8" });
  try {
    const blocked = run("// run x\nx();");
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /run x/);
    assert.equal(run("y();").status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
