#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const PHASE_FILE = join(".superpowers", "phase");
export const IMPLEMENT_PHASE = "implement";

const TEST_PATH = /(^|\/)(__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

export function isTestPath(path) {
  return TEST_PATH.test(path.replaceAll("\\", "/"));
}

export function readPhase(projectDir) {
  const file = join(projectDir, PHASE_FILE);
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

export function isBlocked({ tool_input }, phase) {
  return phase === IMPLEMENT_PHASE && isTestPath(tool_input?.file_path ?? "");
}

function findUp(path, matches) {
  let dir = path;
  while (!matches(dir)) {
    if (dir === dirname(dir)) {
      return null;
    }
    dir = dirname(dir);
  }
  return dir;
}

function workingCopyOf(path) {
  const existingDir = findUp(dirname(resolve(path)), existsSync);
  return existingDir && findUp(realpathSync(existingDir), (dir) => existsSync(join(dir, ".git")));
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const sessionDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const phaseDirs = [workingCopyOf(input.tool_input?.file_path ?? "") ?? sessionDir, sessionDir];
  if (phaseDirs.some((dir) => isBlocked(input, readPhase(dir)))) {
    process.stderr.write(
      [
        `Zablokowane: faza implementacji (${PHASE_FILE} = ${IMPLEMENT_PHASE}), testy są tylko do odczytu.`,
        "Jeśli test jest błędny albo sprzeczny ze specyfikacją, zatrzymaj się i zgłoś to w raporcie zamiast go zmieniać.",
      ].join("\n") + "\n",
    );
    process.exit(2);
  }
}
