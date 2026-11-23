// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDotenv } from "../../../scripts/lib/architecture/dotenv";
import { checkEnvExample } from "../../../scripts/lib/architecture/env-example";

function isModuleInstalled(name: string): boolean {
  const state = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), ".wa/kit.json"), "utf8"),
  ) as {
    modules: Record<string, unknown>;
  };
  return name in state.modules;
}

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

  it.skipIf(!isModuleInstalled("api-keys"))(
    "validates module variables too: a valid core without API_KEY_PEPPER reports that variable",
    () => {
      writeEnvExample(
        [
          "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wa",
          `BETTER_AUTH_SECRET=${"s".repeat(32)}`,
          "APP_URL=http://localhost:3000",
          "EMAIL_FROM=WA App <noreply@example.com>",
          `ENCRYPTION_MASTER_KEY=${"ab".repeat(32)}`,
          "",
        ].join("\n"),
      );
      expect(checkEnvExample(root)).toEqual([
        expect.stringMatching(/^\.env\.example: API_KEY_PEPPER: \S/),
      ]);
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "validates module variables too: .env.example without ENCRYPTION_MASTER_KEY reports that variable",
    () => {
      writeEnvExample(withoutVariable(realEnvExample, "ENCRYPTION_MASTER_KEY"));
      expect(checkEnvExample(root)).toEqual([
        expect.stringMatching(/^\.env\.example: ENCRYPTION_MASTER_KEY: \S/),
      ]);
    },
  );

  it.skipIf(!isModuleInstalled("uploads"))(
    "validates module variables too: STORAGE_PROVIDER=s3 without S3_BUCKET reports that variable",
    () => {
      writeEnvExample(
        `${withoutVariable(withoutVariable(realEnvExample, "STORAGE_PROVIDER"), "S3_BUCKET")}\nSTORAGE_PROVIDER=s3\nS3_ENDPOINT=http://localhost:9000\nS3_ACCESS_KEY_ID=k\nS3_SECRET_ACCESS_KEY=s\n`,
      );
      expect(checkEnvExample(root)).toEqual([
        expect.stringMatching(/^\.env\.example: S3_BUCKET: \S/),
      ]);
    },
  );

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
