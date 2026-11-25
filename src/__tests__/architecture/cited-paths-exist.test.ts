// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkCitedPaths,
  extractCitedPaths,
  findMissingCitedPaths,
} from "../../../scripts/lib/architecture/cited-paths";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const nothingExists = () => false;

describe("extractCitedPaths", () => {
  it("bierze ścieżki z backticków i z celów linków w kolejności wystąpienia", () => {
    expect(
      extractCitedPaths(
        "plik `src/a.ts`, link [b](prisma/schema/auth.prisma) i `scripts/c.ts`",
      ),
    ).toEqual(["src/a.ts", "prisma/schema/auth.prisma", "scripts/c.ts"]);
  });

  it("nie zwraca duplikatów", () => {
    expect(extractCitedPaths("`src/a.ts` i znowu `src/a.ts`")).toEqual([
      "src/a.ts",
    ]);
  });

  it.each([
    "e2e/auth.spec.ts",
    ".claude/hooks/block-comments.mjs",
    ".github/workflows/ci.yml",
    "CLAUDE.md",
    "mutation-gate.json",
    ".env.example",
    "docker-compose.yml",
    "vitest.integration.config.ts",
    "tsconfig.jsonc",
    "lefthook.yaml",
    "netlify.toml",
    "eslint.config.mjs",
    "postcss.config.cjs",
    "next.config.js",
    "vite.config.mts",
  ])("rozpoznaje %s jako ścieżkę repo", (candidate) => {
    expect(extractCitedPaths(`zob. \`${candidate}\``)).toEqual([candidate]);
  });

  it.each([
    "test.prop",
    "auth.api",
    "Object.assign",
    "env.ts",
    "page.tsx",
    "thresholds.break",
    "https://example.com/docs/a.md",
    "npm run verify",
    "src/a.ts i src/b.ts",
    "organizationId",
    "README.mdx",
    "apps/web/next.config.ts",
    "next.config.js.map",
  ])("nie traktuje %s jako ścieżki", (candidate) => {
    expect(extractCitedPaths(`zob. \`${candidate}\``)).toEqual([]);
  });

  it("nie traktuje URL-a w linku jako ścieżki", () => {
    expect(extractCitedPaths("[kit](https://github.com/x/y)")).toEqual([]);
  });
});

describe("findMissingCitedPaths", () => {
  it("zgłasza brakującą ścieżkę, pomija wzorzec z <x> i odsyłacz do docs/ z kotwicą", () => {
    expect(
      findMissingCitedPaths(
        "zob. `src/nope.ts` i `src/features/<x>/module.ts` oraz [d](docs/02-architektura.md#a)",
        nothingExists,
      ),
    ).toEqual(["src/nope.ts"]);
  });

  it("odcina kotwicę przed sprawdzeniem istnienia", () => {
    const exists = (candidate: string) => candidate === "src/a.ts";
    expect(
      findMissingCitedPaths("[a](src/a.ts#L1) i `src/a.ts#sekcja`", exists),
    ).toEqual([]);
  });

  it("zgłasza brakującą ścieżkę bez kotwicy", () => {
    expect(
      findMissingCitedPaths("[a](src/nope.ts#L10)", nothingExists),
    ).toEqual(["src/nope.ts"]);
  });

  it("pomija docs/ i kit/, bo to katalogi tylko kitu", () => {
    expect(
      findMissingCitedPaths(
        "`docs/08-testy.md`, [k](kit/modules/core.json) i `packages/gato-cli/src/`",
        nothingExists,
      ),
    ).toEqual([]);
  });

  it("pomija kandydatów z <, * i {", () => {
    expect(
      findMissingCitedPaths(
        "`src/features/<x>/module.ts`, `src/**/*.test.ts`, `src/a.{ts,tsx}`, `scripts/*`",
        nothingExists,
      ),
    ).toEqual([]);
  });

  it("sprawdza ścieżkę katalogu z końcowym ukośnikiem", () => {
    expect(findMissingCitedPaths("`src/nope/`", nothingExists)).toEqual([
      "src/nope/",
    ]);
  });

  it("sprawdza pliki z katalogu głównego", () => {
    expect(
      findMissingCitedPaths(
        "`CLAUDE.md`, `.env.example` i `mutation-gate.json`",
        nothingExists,
      ),
    ).toEqual(["CLAUDE.md", ".env.example", "mutation-gate.json"]);
  });

  it("istniejące ścieżki nie są naruszeniem", () => {
    const existing = new Set(["src/a.ts", "AGENTS.md"]);
    expect(
      findMissingCitedPaths("`src/a.ts`, [x](AGENTS.md), `src/b.ts`", (p) =>
        existing.has(p),
      ),
    ).toEqual(["src/b.ts"]);
  });

  it("zwraca braki bez duplikatów w kolejności wystąpienia", () => {
    expect(
      findMissingCitedPaths(
        "`src/b.ts` `src/a.ts` [b](src/b.ts) `src/a.ts`",
        nothingExists,
      ),
    ).toEqual(["src/b.ts", "src/a.ts"]);
  });

  it("nie zgłasza słów z kropką, które nie są ścieżkami", () => {
    expect(
      findMissingCitedPaths(
        "`test.prop`, `auth.api`, `Object.assign`, `env.ts`, `page.tsx`, `thresholds.break`, [u](https://x.dev/src/a.ts)",
        nothingExists,
      ),
    ).toEqual([]);
  });
});

describe("checkCitedPaths", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("istniejące pliki i katalogi przechodzą", () => {
    write("src/real.ts", "");
    fs.mkdirSync(path.join(root, "src/dir"), { recursive: true });
    write("AGENTS.md", "`src/real.ts`, `src/dir/` i `CLAUDE.md`");
    write("CLAUDE.md", "[a](AGENTS.md)");
    expect(checkCitedPaths(root)).toEqual([]);
  });

  it("zgłasza brakującą ścieżkę w AGENTS.md", () => {
    write("src/real.ts", "");
    write("AGENTS.md", "`src/real.ts` i `src/nope.ts`");
    expect(checkCitedPaths(root)).toEqual(["AGENTS.md: src/nope.ts"]);
  });

  it("zgłasza brakującą ścieżkę w CLAUDE.md", () => {
    write("CLAUDE.md", "`scripts/nope.ts`");
    expect(checkCitedPaths(root)).toEqual(["CLAUDE.md: scripts/nope.ts"]);
  });

  it("czyta pliki .md w .claude rekurencyjnie", () => {
    write(".claude/agents/x.md", "`src/nope.ts`");
    write(".claude/skills/a/b/SKILL.md", "[p](prisma/nope.prisma)");
    expect([...checkCitedPaths(root)].sort()).toEqual([
      ".claude/agents/x.md: src/nope.ts",
      ".claude/skills/a/b/SKILL.md: prisma/nope.prisma",
    ]);
  });

  it("does not report the optional companion files cited in AGENTS.md when they are absent", () => {
    write(
      "AGENTS.md",
      "read `AGENTS.project.md` first; extend `mutation-gate.project.json`",
    );
    expect(checkCitedPaths(root)).toEqual([]);
  });

  it("does not report the optional companion files cited in CLAUDE.md, also as link targets", () => {
    write(
      "CLAUDE.md",
      "[p](AGENTS.project.md), `AGENTS.project.md` and [g](mutation-gate.project.json)",
    );
    expect(checkCitedPaths(root)).toEqual([]);
  });

  it("still reports another absent root file cited next to the companion files", () => {
    write(
      "AGENTS.md",
      "`AGENTS.project.md`, `mutation-gate.project.json` and `nope.md`",
    );
    expect(checkCitedPaths(root)).toEqual(["AGENTS.md: nope.md"]);
  });

  it("still reports an absent mutation-gate.json next to the companion files", () => {
    write("AGENTS.md", "`mutation-gate.project.json` and `mutation-gate.json`");
    expect(checkCitedPaths(root)).toEqual(["AGENTS.md: mutation-gate.json"]);
  });

  it("nie czyta README.md", () => {
    write("README.md", "`src/nope.ts`");
    expect(checkCitedPaths(root)).toEqual([]);
  });
});

describe("instrukcje agentów w repo", () => {
  it("cytują tylko istniejące ścieżki", () => {
    expect(checkCitedPaths(repoRoot)).toEqual([]);
  });
});
