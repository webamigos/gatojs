// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const THIS_FILE = "src/__tests__/architecture/dotenv-quiet.test.ts";

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const EXCLUDED_SEGMENTS = ["/node_modules/", "/fixtures/", "/src/generated/"];

const DEFAULT_OR_NAMESPACE_IMPORT =
  /import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s+["']dotenv["']/g;
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']dotenv["']/g;
const REQUIRE_BINDING =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']dotenv["']\s*\)/g;
const SIDE_EFFECT_IMPORT =
  /import\s+["']dotenv\/config["']|require\(\s*["']dotenv\/config["']\s*\)/g;
const QUIET_TRUE = /\bquiet\s*:\s*true\b/;

type DotenvCall = { line: number; quiet: boolean };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function argumentsAfter(source: string, openParen: number): string {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    if (source[index] === "(") {
      depth += 1;
    }
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParen + 1, index);
      }
    }
  }
  return source.slice(openParen + 1);
}

function callPatterns(source: string): RegExp[] {
  const patterns: RegExp[] = [
    /require\(\s*["']dotenv["']\s*\)\s*\.\s*config\s*\(/g,
  ];
  for (const match of source.matchAll(DEFAULT_OR_NAMESPACE_IMPORT)) {
    patterns.push(
      new RegExp(`\\b${escapeRegExp(match[1])}\\s*\\.\\s*config\\s*\\(`, "g"),
    );
  }
  for (const match of source.matchAll(REQUIRE_BINDING)) {
    patterns.push(
      new RegExp(`\\b${escapeRegExp(match[1])}\\s*\\.\\s*config\\s*\\(`, "g"),
    );
  }
  for (const match of source.matchAll(NAMED_IMPORT)) {
    for (const specifier of match[1].split(",")) {
      const [imported, local] = specifier.trim().split(/\s+as\s+/);
      if (imported === "config") {
        patterns.push(
          new RegExp(
            `(?<![.\\w$])${escapeRegExp(local ?? imported)}\\s*\\(`,
            "g",
          ),
        );
      }
    }
  }
  return patterns;
}

function dotenvConfigCalls(source: string): DotenvCall[] {
  const calls: DotenvCall[] = [];
  for (const pattern of callPatterns(source)) {
    for (const match of source.matchAll(pattern)) {
      const openParen = (match.index ?? 0) + match[0].length - 1;
      calls.push({
        line: lineAt(source, match.index ?? 0),
        quiet: QUIET_TRUE.test(argumentsAfter(source, openParen)),
      });
    }
  }
  for (const match of source.matchAll(SIDE_EFFECT_IMPORT)) {
    calls.push({ line: lineAt(source, match.index ?? 0), quiet: false });
  }
  return calls.sort((a, b) => a.line - b.line);
}

function loudDotenvLines(source: string): number[] {
  return dotenvConfigCalls(source)
    .filter((call) => !call.quiet)
    .map((call) => call.line);
}

function trackedSourceFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(
      (file) =>
        SOURCE_FILE.test(file) &&
        file !== THIS_FILE &&
        !EXCLUDED_SEGMENTS.some((segment) => `/${file}`.includes(segment)) &&
        fs.existsSync(path.join(repoRoot, file)),
    );
}

function readRepoFile(file: string): string {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

describe("loudDotenvLines", () => {
  it("zgłasza dotenv.config z samą ścieżką, bez quiet", () => {
    const source = [
      'import dotenv from "dotenv";',
      "",
      'dotenv.config({ path: [".env.local", ".env"] });',
    ].join("\n");

    expect(loudDotenvLines(source)).toEqual([3]);
  });

  it("nie zgłasza dotenv.config z quiet: true", () => {
    const source = [
      'import dotenv from "dotenv";',
      "",
      'dotenv.config({ path: [".env.local", ".env"], quiet: true });',
    ].join("\n");

    expect(loudDotenvLines(source)).toEqual([]);
  });

  it("zgłasza dotenv.config bez argumentów", () => {
    expect(
      loudDotenvLines('import dotenv from "dotenv";\ndotenv.config();\n'),
    ).toEqual([2]);
  });

  it("zgłasza quiet: false", () => {
    expect(
      loudDotenvLines(
        'import dotenv from "dotenv";\ndotenv.config({ quiet: false });\n',
      ),
    ).toEqual([2]);
  });

  it("czyta opcje rozpisane na wiele linii i podaje linię wywołania", () => {
    const source = [
      'import dotenv from "dotenv";',
      "dotenv.config({",
      '  path: ".env",',
      "  quiet: true,",
      "});",
      "dotenv.config({",
      '  path: ".env.local",',
      "});",
    ].join("\n");

    expect(loudDotenvLines(source)).toEqual([6]);
  });

  it("nie bierze quiet z kolejnego wywołania za opcję poprzedniego", () => {
    const source = [
      'import dotenv from "dotenv";',
      'dotenv.config({ path: ".env" });',
      'dotenv.config({ path: ".env.local", quiet: true });',
    ].join("\n");

    expect(loudDotenvLines(source)).toEqual([2]);
  });

  it("zgłasza nazwany import config i alias", () => {
    const named =
      'import { config } from "dotenv";\nconfig({ path: ".env" });\n';
    const aliased =
      'import { config as loadEnv } from "dotenv";\n\nloadEnv();\n';

    expect(loudDotenvLines(named)).toEqual([2]);
    expect(loudDotenvLines(aliased)).toEqual([3]);
  });

  it("zgłasza import przestrzeni nazw i require", () => {
    const namespace =
      'import * as env from "dotenv";\nenv.config({ path: ".env" });\n';
    const required = 'const dotenv = require("dotenv");\ndotenv.config();\n';
    const inline = 'require("dotenv").config({ path: ".env" });\n';

    expect(loudDotenvLines(namespace)).toEqual([2]);
    expect(loudDotenvLines(required)).toEqual([2]);
    expect(loudDotenvLines(inline)).toEqual([1]);
  });

  it("zgłasza import efektu ubocznego dotenv/config, który nie przyjmuje quiet", () => {
    expect(loudDotenvLines('import "dotenv/config";\n')).toEqual([1]);
  });

  it("nie zgłasza config( z innych modułów ani dotenv.parse", () => {
    const source = [
      'import dotenv from "dotenv";',
      'import { config } from "./app-config";',
      "dotenv.parse(text);",
      "config({ path: 1 });",
      "next.config({});",
    ].join("\n");

    expect(loudDotenvLines(source)).toEqual([]);
  });

  test.prop([fc.nat({ max: 20 }), fc.stringMatching(/^[a-z.]{1,12}$/)])(
    "wywołanie bez quiet jest zgłaszane w swojej linii, a z quiet: true nie",
    (blankLines, envFile) => {
      const header = `import dotenv from "dotenv";\n${"\n".repeat(blankLines)}`;
      const loud = `${header}dotenv.config({ path: "${envFile}" });\n`;
      const quiet = `${header}dotenv.config({ path: "${envFile}", quiet: true });\n`;

      expect(loudDotenvLines(loud)).toEqual([blankLines + 2]);
      expect(loudDotenvLines(quiet)).toEqual([]);
    },
  );
});

describe("dotenv.config w repozytorium jest wyciszony", () => {
  it("skan obejmuje znane wywołania dotenv.config", () => {
    const filesWithCalls = trackedSourceFiles().filter(
      (file) => dotenvConfigCalls(readRepoFile(file)).length > 0,
    );

    expect(filesWithCalls).toEqual(
      expect.arrayContaining([
        "prisma.config.ts",
        "scripts/admin-create.ts",
        "scripts/setup-organizations.ts",
        "vitest.setup.ts",
      ]),
    );
  });

  it("skan pomija node_modules, fixtures i katalogi generowane", () => {
    const files = trackedSourceFiles();

    expect(files).toContain("vitest.setup.ts");
    expect(files.some((file) => file.includes("/fixtures/"))).toBe(false);
    expect(files.some((file) => file.includes("node_modules/"))).toBe(false);
    expect(files.some((file) => file.startsWith("src/generated/"))).toBe(false);
  });

  it("każde wywołanie dotenv.config przekazuje quiet: true", () => {
    const offenders = trackedSourceFiles().flatMap((file) =>
      loudDotenvLines(readRepoFile(file)).map((line) => `${file}:${line}`),
    );

    expect(offenders).toEqual([]);
  });
});
