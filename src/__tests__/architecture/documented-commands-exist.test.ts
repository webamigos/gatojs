// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDocumentedCommands,
  findUndocumentedCommands,
} from "../../../scripts/lib/architecture/documented-commands";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("findUndocumentedCommands", () => {
  it("zgłasza tylko skrypt nieobecny w package.json", () => {
    expect(
      findUndocumentedCommands("uruchom `npm run verify` i `npm run nope`", {
        verify: "x",
      }),
    ).toEqual(["npm run nope"]);
  });

  it("ignoruje argumenty po nazwie skryptu", () => {
    expect(
      findUndocumentedCommands("npm run wa -- generate", { wa: "x" }),
    ).toEqual([]);
  });

  it("nie dokleja argumentów do nazwy brakującego skryptu", () => {
    expect(findUndocumentedCommands("npm run wa -- generate", {})).toEqual([
      "npm run wa",
    ]);
  });

  it("kropka kończy nazwę skryptu", () => {
    expect(
      findUndocumentedCommands("Przed oddaniem pracy: npm run verify.", {
        verify: "x",
      }),
    ).toEqual([]);
  });

  it("nazwa z dwukropkami to jedna nazwa, prefiks jej nie pokrywa", () => {
    expect(
      findUndocumentedCommands("`npm run test:mutation:task -- src/a.ts`", {
        "test:mutation": "x",
      }),
    ).toEqual(["npm run test:mutation:task"]);
  });

  it("nazwa z dwukropkami istniejąca w package.json przechodzi", () => {
    expect(
      findUndocumentedCommands("npm run test:mutation:task -- src/a.ts", {
        "test:mutation:task": "x",
      }),
    ).toEqual([]);
  });

  it("zwraca brakujące bez duplikatów w kolejności pierwszego wystąpienia", () => {
    expect(
      findUndocumentedCommands(
        "npm run b\nnpm run a\nnpm run b\nnpm run ok\nnpm run a",
        { ok: "x" },
      ),
    ).toEqual(["npm run b", "npm run a"]);
  });

  it("tekst bez komend nie ma naruszeń", () => {
    expect(findUndocumentedCommands("npm test i npm install", {})).toEqual([]);
  });
});

describe("checkDocumentedCommands", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    write("package.json", JSON.stringify({ scripts: { verify: "x" } }));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("wszystkie komendy istnieją, a brakujące pliki są pomijane", () => {
    write("AGENTS.md", "npm run verify");
    expect(checkDocumentedCommands(root)).toEqual([]);
  });

  it("zgłasza brakującą komendę w CLAUDE.md", () => {
    write("CLAUDE.md", "npm run verify, npm run nope");
    expect(checkDocumentedCommands(root)).toEqual(["CLAUDE.md: npm run nope"]);
  });

  it("zgłasza brakującą komendę w AGENTS.md", () => {
    write("AGENTS.md", "npm run nope");
    expect(checkDocumentedCommands(root)).toEqual(["AGENTS.md: npm run nope"]);
  });

  it("czyta README.md", () => {
    write("README.md", "npm run nope");
    expect(checkDocumentedCommands(root)).toEqual(["README.md: npm run nope"]);
  });

  it("czyta pliki .md w .claude rekurencyjnie", () => {
    write(".claude/agents/x.md", "npm run nope");
    write(".claude/skills/deep/y/SKILL.md", "npm run other");
    expect([...checkDocumentedCommands(root)].sort()).toEqual([
      ".claude/agents/x.md: npm run nope",
      ".claude/skills/deep/y/SKILL.md: npm run other",
    ]);
  });

  it("nie czyta plików innych niż .md w .claude ani innych plików .md w katalogu głównym", () => {
    write(".claude/hooks/x.mjs", "npm run nope");
    write("CHANGELOG.md", "npm run nope");
    expect(checkDocumentedCommands(root)).toEqual([]);
  });
});

describe("dokumentacja repo", () => {
  it("wymienia tylko komendy istniejące w package.json", () => {
    expect(checkDocumentedCommands(repoRoot)).toEqual([]);
  });
});
