// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDotenv } from "../../../scripts/lib/architecture/dotenv";
import { checkEnvExample } from "../../../scripts/lib/architecture/env-example";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const realEnvExample = fs.readFileSync(
  path.join(repoRoot, ".env.example"),
  "utf8",
);

const withoutVariable = (text: string, name: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith(`${name}=`))
    .join("\n");

describe("parseDotenv", () => {
  it("czyta pary, pomija komentarze i puste linie, zdejmuje cudzysłowy", () => {
    expect(parseDotenv('A=1\n# x\n\nB="two"\n')).toEqual({ A: "1", B: "two" });
  });

  it("dzieli na pierwszym znaku =", () => {
    expect(parseDotenv("URL=postgres://h/db?a=b&c=d")).toEqual({
      URL: "postgres://h/db?a=b&c=d",
    });
  });

  it("pomija komentarz poprzedzony spacjami i linię bez =", () => {
    expect(parseDotenv("   # KOMENTARZ=1\nBEZ_ROWNA\nA=1")).toEqual({ A: "1" });
  });

  it("przycina klucz i wartość", () => {
    expect(parseDotenv("  KEY  =  value  ")).toEqual({ KEY: "value" });
  });

  it("pusta wartość to pusty napis", () => {
    expect(parseDotenv("RESEND_API_KEY=")).toEqual({ RESEND_API_KEY: "" });
  });

  it("zdejmuje pojedyncze cudzysłowy", () => {
    expect(parseDotenv("A='x y'")).toEqual({ A: "x y" });
  });

  it("zostawia niedopasowane cudzysłowy", () => {
    expect(parseDotenv("A=\"x'\nB='y\nC=z\"")).toEqual({
      A: "\"x'",
      B: "'y",
      C: 'z"',
    });
  });

  it("zdejmuje tylko jedną parę cudzysłowów", () => {
    expect(parseDotenv('A=""x""')).toEqual({ A: '"x"' });
  });

  it("cudzysłów otwierający bez zamykającego na końcu zostaje", () => {
    expect(parseDotenv('A="x"y')).toEqual({ A: '"x"y' });
  });

  it("cudzysłów zamykający bez otwierającego na początku zostaje", () => {
    expect(parseDotenv('A=x"y"')).toEqual({ A: 'x"y"' });
  });

  it("pusta para cudzysłowów daje pusty napis", () => {
    expect(parseDotenv('A=""')).toEqual({ A: "" });
  });

  test.prop([
    fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/),
    fc.stringMatching(/^[ -!#-&(-~]*$/),
  ])(
    "KEY=<wartość bez cudzysłowów i nowych linii> daje tę samą wartość po przycięciu",
    (key, value) => {
      expect(parseDotenv(`${key}=${value}`)).toEqual({ [key]: value.trim() });
    },
  );

  test.prop([
    fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/),
    fc.stringMatching(/^([!#-~]([ -!#-~]*[!#-~])?)?$/),
  ])('KEY="<wartość>" daje wartość bez cudzysłowów', (key, value) => {
    expect(parseDotenv(`${key}="${value}"`)).toEqual({ [key]: value });
  });
});

describe("checkEnvExample", () => {
  let root: string;

  const writeEnvExample = (content: string) => {
    fs.writeFileSync(path.join(root, ".env.example"), content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("pełny zestaw z .env.example przechodzi", () => {
    writeEnvExample(realEnvExample);
    expect(checkEnvExample(root)).toEqual([]);
  });

  it("brak DATABASE_URL zgłasza nazwę zmiennej z prefiksem pliku", () => {
    writeEnvExample(withoutVariable(realEnvExample, "DATABASE_URL"));
    expect(checkEnvExample(root)).toEqual([
      expect.stringMatching(/^\.env\.example: DATABASE_URL: /),
    ]);
  });

  it("nadpisuje NODE_ENV na development, więc pusty RESEND_API_KEY przy NODE_ENV=production przechodzi", () => {
    writeEnvExample(
      `${withoutVariable(realEnvExample, "RESEND_API_KEY")}\nRESEND_API_KEY=\nNODE_ENV=production\n`,
    );
    expect(checkEnvExample(root)).toEqual([]);
  });

  it("zdejmuje cudzysłowy z wartości przed walidacją", () => {
    writeEnvExample(
      `${withoutVariable(realEnvExample, "APP_URL")}\nAPP_URL="http://localhost:3000"\n`,
    );
    expect(checkEnvExample(root)).toEqual([]);
  });
});

describe(".env.example w repo", () => {
  it("przechodzi walidację środowiska z rejestrem modułów", () => {
    expect(checkEnvExample(repoRoot)).toEqual([]);
  });
});
