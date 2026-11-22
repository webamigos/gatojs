// @vitest-environment node
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const SLOW = 60_000;
const WARM_UP = 900_000;

let eslint: ESLint;

// WHY: pierwsze lintText ładuje konfigurację, parser i pluginy, co na obciążonej maszynie trwa minuty;
// rozgrzewka w beforeAll zostawia testom tylko samo lintowanie.
beforeAll(async () => {
  eslint = new ESLint({ cwd: process.cwd() });
  await eslint.lintText("export {};\n", { filePath: "src/shared/foo.ts" });
}, WARM_UP);

async function restrictedSyntaxReports(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map(({ line, severity }) => ({ line, severity }));
}

describe("reguła ESLint: klasa dziedzicząca po Error ma własne name", () => {
  describe("zgłasza klasę bez własnego name", () => {
    it(
      "eksportowana klasa z pustym ciałem w src",
      async () => {
        const code = 'import "x";\nexport class FooError extends Error {}\n';
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([{ line: 2, severity: 2 }]);
      },
      SLOW,
    );

    it(
      "wyrażenie klasowe z konstruktorem bez name",
      async () => {
        const code = [
          'import "x";',
          "export const E = class extends Error {",
          "  constructor() {",
          '    super("x");',
          "  }",
          "};",
          "",
        ].join("\n");
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([{ line: 2, severity: 2 }]);
      },
      SLOW,
    );

    it(
      "this.name ustawiane tylko w if w konstruktorze",
      async () => {
        const code = [
          'import "x";',
          "export class FooError extends Error {",
          "  constructor(flag: boolean) {",
          '    super("x");',
          "    if (flag) {",
          '      this.name = "FooError";',
          "    }",
          "  }",
          "}",
          "",
        ].join("\n");
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([{ line: 2, severity: 2 }]);
      },
      SLOW,
    );

    it(
      "this.name ustawiane tylko w zwykłej metodzie",
      async () => {
        const code = [
          'import "x";',
          "export class FooError extends Error {",
          "  rename() {",
          '    this.name = "FooError";',
          "  }",
          "}",
          "",
        ].join("\n");
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([{ line: 2, severity: 2 }]);
      },
      SLOW,
    );

    it(
      "samo declare name: string bez wartości",
      async () => {
        const code = [
          'import "x";',
          "export class FooError extends Error {",
          "  declare name: string;",
          "}",
          "",
        ].join("\n");
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([{ line: 2, severity: 2 }]);
      },
      SLOW,
    );

    it(
      "klasa w scripts/lib",
      async () => {
        const code = 'import "x";\nexport class FooError extends Error {}\n';
        expect(await restrictedSyntaxReports(code, "scripts/lib/x.ts")).toEqual(
          [{ line: 2, severity: 2 }],
        );
      },
      SLOW,
    );
  });

  describe("przepuszcza klasę z własnym name albo spoza zakresu reguły", () => {
    it(
      "pole name z napisem",
      async () => {
        const code =
          'export class FooError extends Error {\n  name = "FooError";\n}\n';
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([]);
      },
      SLOW,
    );

    it(
      "pole override readonly name z napisem",
      async () => {
        const code =
          'export class FooError extends Error {\n  override readonly name = "FooError";\n}\n';
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([]);
      },
      SLOW,
    );

    it(
      "this.name jako osobna instrukcja konstruktora",
      async () => {
        const code = [
          "export class FooError extends Error {",
          "  constructor() {",
          '    super("x");',
          '    this.name = "FooError";',
          "  }",
          "}",
          "",
        ].join("\n");
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([]);
      },
      SLOW,
    );

    it(
      "klasa dziedzicząca po TypeError, nie wprost po Error",
      async () => {
        const code = "export class X extends TypeError {}\n";
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([]);
      },
      SLOW,
    );

    it(
      "klasa bez extends",
      async () => {
        const code = "export class X {}\n";
        expect(
          await restrictedSyntaxReports(code, "src/shared/foo.ts"),
        ).toEqual([]);
      },
      SLOW,
    );

    it(
      "klasa bez name w pliku testu w __tests__",
      async () => {
        const code = "export class FooError extends Error {}\n";
        expect(
          await restrictedSyntaxReports(code, "src/x/__tests__/a.test.ts"),
        ).toEqual([]);
      },
      SLOW,
    );

    it(
      "klasa bez name w specyfikacji e2e",
      async () => {
        const code = "export class FooError extends Error {}\n";
        expect(await restrictedSyntaxReports(code, "e2e/a.spec.ts")).toEqual(
          [],
        );
      },
      SLOW,
    );

    it(
      "declare class w pliku .d.ts",
      async () => {
        const code = "export declare class X extends Error {}\n";
        expect(
          await restrictedSyntaxReports(code, "src/types/sdk.d.ts"),
        ).toEqual([]);
      },
      SLOW,
    );
  });

  it(
    "w pliku testu nadal zgłasza name czytane z this.constructor.name",
    async () => {
      const code = [
        "export class FooError extends Error {",
        "  constructor() {",
        '    super("x");',
        "    this.name = this.constructor.name;",
        "  }",
        "}",
        "",
      ].join("\n");
      expect(
        await restrictedSyntaxReports(code, "src/x/__tests__/a.test.ts"),
      ).toEqual([{ line: 4, severity: 2 }]);
    },
    SLOW,
  );
});
