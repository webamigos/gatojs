#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const EXEMPT_PATH = /(^|\/)(node_modules|generated|components\/ui)\//;
const ALLOWED = /^(#!|\/\/\/ <reference|\/\/ @vitest-environment|\/\/ cache-scope:|\/\/ WHY:|\/\* WHY:|\/\/ @ts-expect-error|\/\/ prettier-ignore|\/\/ eslint-(disable|enable)|\/\* eslint-(disable|enable)|\{?\/\* eslint-disable)/;

function stripStrings(line) {
  return line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
}

const WHY_MAX_LINES = 3;

function isComment(line) {
  const code = stripStrings(line).replace(/\/\*\s*(turbopack|webpack)\w*:[^*]*\*\//g, "");
  return /^(\/\/|\/\*|\*|\{\/\*)/.test(code) || /\s\/\/|\/\*/.test(code);
}

function opensBlock(line) {
  const code = stripStrings(line);
  const start = code.lastIndexOf("/*");
  return start !== -1 && !code.includes("*/", start + 2);
}

export function commentLines(source) {
  const found = [];
  let why = null;
  let inBlock = false;
  for (const line of source.split("\n").map((l) => l.trim())) {
    if (inBlock) {
      found.push(line);
      inBlock = !line.includes("*/");
      continue;
    }
    if (why && (why.block || (/^\/\/(?!\/)/.test(line) && !/^\/\/ WHY:/.test(line)))) {
      why.lines += 1;
      if (why.lines > WHY_MAX_LINES) {
        found.push(line);
      }
      if (why.block && line.includes("*/")) {
        why = null;
      }
      continue;
    }
    why = null;
    if (/^\/\/ WHY:/.test(line)) {
      why = { block: false, lines: 1 };
      continue;
    }
    if (/^\/\* WHY:/.test(line)) {
      why = line.includes("*/") ? null : { block: true, lines: 1 };
      continue;
    }
    if (!ALLOWED.test(line) && isComment(line)) {
      found.push(line);
      inBlock = opensBlock(line);
    }
  }
  return found;
}

export function addedComments(before, after) {
  const remaining = new Map();
  for (const line of commentLines(before)) {
    remaining.set(line, (remaining.get(line) ?? 0) + 1);
  }
  return commentLines(after).filter((line) => {
    const count = remaining.get(line) ?? 0;
    if (count > 0) {
      remaining.set(line, count - 1);
      return false;
    }
    return true;
  });
}

export function check({ tool_name, tool_input }) {
  const path = tool_input?.file_path ?? "";
  if (!CODE_FILE.test(path) || EXEMPT_PATH.test(path)) {
    return [];
  }
  if (tool_name === "Edit") {
    return addedComments(tool_input.old_string ?? "", tool_input.new_string ?? "");
  }
  if (tool_name === "Write") {
    const before = existsSync(path) ? readFileSync(path, "utf8") : "";
    return addedComments(before, tool_input.content ?? "");
  }
  return [];
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  const added = check(JSON.parse(readFileSync(0, "utf8")));
  if (added.length > 0) {
    process.stderr.write(
      [
        "Blocked: this edit adds code comments. The code must explain itself.",
        "Rename, extract a function or a named constant instead. Lines found:",
        ...added.slice(0, 10).map((line) => `  ${line}`),
        `Only a non-obvious reason the code cannot show may stay, as \`// WHY: …\` in at most ${WHY_MAX_LINES} lines.`,
      ].join("\n") + "\n",
    );
    process.exit(2);
  }
}
