// @vitest-environment node
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const SLOW = 60_000;
const WARM_UP = 900_000;

const fixture = [
  "export class FooError extends Error {",
  "  constructor() {",
  '    super("x");',
  "    this.name = this.constructor.name;",
  "  }",
  "}",
  "",
  "export function compare(a: unknown, b: unknown) {",
  "  console.log(a);",
  '  return a == b ? "same" : a ? "left" : "right";',
  "}",
  "",
].join("\n");

let eslint: ESLint;

// WHY: the first lintText loads the config, parsers and plugins, which takes minutes on a busy machine;
// warming up in beforeAll leaves only the linting itself to the tests.
beforeAll(async () => {
  eslint = new ESLint({ cwd: process.cwd() });
  await eslint.lintText("export {};\n", { filePath: "src/shared/warm-up.ts" });
}, WARM_UP);

async function reports(filePath: string) {
  const [result] = await eslint.lintText(fixture, { filePath });
  return result.messages
    .map(({ ruleId, line, severity }) => ({ ruleId, line, severity }))
    .sort(
      (left, right) =>
        String(left.ruleId).localeCompare(String(right.ruleId)) ||
        left.line - right.line,
    );
}

describe("root eslint.config.mjs uses the shared GatoJS rules", () => {
  it(
    "reports exactly eqeqeq, no-console, no-nested-ternary and no-restricted-syntax in a source file",
    async () => {
      expect(await reports("src/shared/fixture.ts")).toEqual([
        { ruleId: "eqeqeq", line: 10, severity: 2 },
        { ruleId: "no-console", line: 9, severity: 2 },
        { ruleId: "no-nested-ternary", line: 10, severity: 2 },
        { ruleId: "no-restricted-syntax", line: 4, severity: 2 },
      ]);
    },
    SLOW,
  );

  it(
    "drops only no-console in a test file",
    async () => {
      expect(await reports("src/shared/__tests__/fixture.ts")).toEqual([
        { ruleId: "eqeqeq", line: 10, severity: 2 },
        { ruleId: "no-nested-ternary", line: 10, severity: 2 },
        { ruleId: "no-restricted-syntax", line: 4, severity: 2 },
      ]);
    },
    SLOW,
  );
});
