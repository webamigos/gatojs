// @vitest-environment node
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";
import base, { ignores, restrictedSyntax, testFiles } from "../base.mjs";
import next from "../next.mjs";
import node from "../node.mjs";

const SLOW = 60_000;
const WARM_UP = 900_000;

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

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

const fixtureReportsOutsideTests = [
  { ruleId: "eqeqeq", line: 10, severity: 2 },
  { ruleId: "no-console", line: 9, severity: 2 },
  { ruleId: "no-nested-ternary", line: 10, severity: 2 },
  { ruleId: "no-restricted-syntax", line: 4, severity: 2 },
];

const fixtureReportsInTests = [
  { ruleId: "eqeqeq", line: 10, severity: 2 },
  { ruleId: "no-nested-ternary", line: 10, severity: 2 },
  { ruleId: "no-restricted-syntax", line: 4, severity: 2 },
];

const extraSelectorConfig = [
  ...base,
  ...restrictedSyntax([
    { selector: "DebuggerStatement", message: "no debugger" },
  ]),
];

type LinterName = "base" | "next" | "node" | "extra";

const linters = {} as Record<LinterName, ESLint>;

function createLinter(config: readonly unknown[]) {
  return new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: config as Linter.Config[],
  });
}

// WHY: the first lintText loads the config, parsers and plugins, which takes minutes on a busy machine;
// warming up in beforeAll leaves only the linting itself to the tests.
beforeAll(async () => {
  linters.base = createLinter(base);
  linters.next = createLinter(next);
  linters.node = createLinter(node);
  linters.extra = createLinter(extraSelectorConfig);
  await Promise.all(
    Object.values(linters).map((eslint) =>
      eslint.lintText("export {};\n", { filePath: "src/warm-up.ts" }),
    ),
  );
}, WARM_UP);

async function lint(name: LinterName, code: string, filePath: string) {
  const [result] = await linters[name].lintText(code, { filePath });
  return result.messages;
}

async function reports(name: LinterName, code: string, filePath: string) {
  const messages = await lint(name, code, filePath);
  return messages
    .map(({ ruleId, line, severity }) => ({ ruleId, line, severity }))
    .sort(
      (left, right) =>
        String(left.ruleId).localeCompare(String(right.ruleId)) ||
        left.line - right.line,
    );
}

async function reportsOf(
  name: LinterName,
  ruleId: string,
  code: string,
  filePath: string,
) {
  const messages = await lint(name, code, filePath);
  return messages
    .filter((message) => message.ruleId === ruleId)
    .map(({ line, severity }) => ({ line, severity }));
}

async function ruleSeverity(
  name: LinterName,
  filePath: string,
  ruleId: string,
) {
  const config = (await linters[name].calculateConfigForFile(filePath)) as
    Linter.Config | undefined;
  const entry = config?.rules?.[ruleId];
  return Array.isArray(entry) ? entry[0] : entry;
}

describe.each(["base", "next", "node"] as const)(
  "%s config on the GatoJS fixture",
  (name) => {
    it(
      "reports exactly eqeqeq, no-console, no-nested-ternary and no-restricted-syntax as errors outside tests",
      async () => {
        expect(await reports(name, fixture, "src/fixture.ts")).toEqual(
          fixtureReportsOutsideTests,
        );
      },
      SLOW,
    );

    it.each([
      "src/__tests__/fixture.ts",
      "src/fixture.test.ts",
      "e2e/fixture.spec.ts",
      "src/fixture.spec.tsx",
    ])(
      "drops only no-console in the test file %s",
      async (filePath) => {
        expect(await reports(name, fixture, filePath)).toEqual(
          fixtureReportsInTests,
        );
      },
      SLOW,
    );
  },
);

describe.each(["base", "next", "node"] as const)("%s config rules", (name) => {
  it(
    "allows a loose comparison with null",
    async () => {
      const code =
        "export function f(x: unknown) {\n  return x == null || x != null;\n}\n";
      expect(await reportsOf(name, "eqeqeq", code, "src/a.ts")).toEqual([]);
    },
    SLOW,
  );

  it(
    "reports a loose comparison of two values as an error",
    async () => {
      const code =
        "export function f(a: unknown, b: unknown) {\n  return a == b;\n}\n";
      expect(await reportsOf(name, "eqeqeq", code, "src/a.ts")).toEqual([
        { line: 2, severity: 2 },
      ]);
    },
    SLOW,
  );

  it(
    "reports an if without braces as a curly error",
    async () => {
      const code =
        "export function f(a: boolean, b: () => void) {\n  if (a) b();\n}\n";
      expect(await reportsOf(name, "curly", code, "src/a.ts")).toEqual([
        { line: 2, severity: 2 },
      ]);
    },
    SLOW,
  );

  it(
    "reports a single-statement if without braces too (curly all, not multi)",
    async () => {
      const code = [
        "export function f(a: boolean, b: () => void, c: () => void) {",
        "  if (a) {",
        "    b();",
        "  } else c();",
        "}",
        "",
      ].join("\n");
      expect(await reportsOf(name, "curly", code, "src/a.ts")).toEqual([
        { line: 4, severity: 2 },
      ]);
    },
    SLOW,
  );

  it(
    "reports a nested ternary as an error in a test file",
    async () => {
      const code =
        'export const f = (a: boolean, b: boolean) => (a ? "x" : b ? "y" : "z");\n';
      expect(
        await reportsOf(name, "no-nested-ternary", code, "src/__tests__/a.ts"),
      ).toEqual([{ line: 1, severity: 2 }]);
    },
    SLOW,
  );

  it(
    "keeps console allowed in a test file but reports it in a source file",
    async () => {
      const code = 'console.log("x");\n';
      expect(
        await reportsOf(name, "no-console", code, "src/__tests__/a.ts"),
      ).toEqual([]);
      expect(await reportsOf(name, "no-console", code, "src/a.ts")).toEqual([
        { line: 1, severity: 2 },
      ]);
    },
    SLOW,
  );

  it(
    "reports a value import used only as a type in a .ts file as a consistent-type-imports error",
    async () => {
      const code = 'import { Foo } from "./foo";\nexport const x: Foo = 1;\n';
      expect(
        await reportsOf(
          name,
          "@typescript-eslint/consistent-type-imports",
          code,
          "src/a.ts",
        ),
      ).toEqual([{ line: 1, severity: 2 }]);
    },
    SLOW,
  );

  it(
    "accepts an import type in a .ts file",
    async () => {
      const code =
        'import type { Foo } from "./foo";\nexport const x: Foo = 1;\n';
      expect(
        await reportsOf(
          name,
          "@typescript-eslint/consistent-type-imports",
          code,
          "src/a.ts",
        ),
      ).toEqual([]);
    },
    SLOW,
  );

  it.each(["src/a.tsx", "src/a.mts", "src/a.cts"])(
    "enables consistent-type-imports as an error in %s",
    async (filePath) => {
      expect(
        await ruleSeverity(
          name,
          filePath,
          "@typescript-eslint/consistent-type-imports",
        ),
      ).toBe(2);
    },
    SLOW,
  );

  it(
    "lints an .mjs file without a fatal error and without consistent-type-imports",
    async () => {
      const messages = await lint(
        name,
        'import x from "y";\nexport default x;\n',
        "src/a.mjs",
      );
      expect(messages.filter((message) => message.fatal)).toEqual([]);
      expect(
        messages.filter(
          (message) =>
            message.ruleId === "@typescript-eslint/consistent-type-imports",
        ),
      ).toEqual([]);
      expect([undefined, 0, "off"]).toContain(
        await ruleSeverity(
          name,
          "src/a.mjs",
          "@typescript-eslint/consistent-type-imports",
        ),
      );
    },
    SLOW,
  );

  it(
    "reports an explicit any as an error",
    async () => {
      expect(
        await reportsOf(
          name,
          "@typescript-eslint/no-explicit-any",
          "export const x: any = 1;\n",
          "src/a.ts",
        ),
      ).toEqual([{ line: 1, severity: 2 }]);
    },
    SLOW,
  );

  describe("error class name", () => {
    it(
      "reports a class extending Error without its own name in a source file",
      async () => {
        expect(
          await reportsOf(
            name,
            "no-restricted-syntax",
            "export class FooError extends Error {}\n",
            "src/a.ts",
          ),
        ).toEqual([{ line: 1, severity: 2 }]);
      },
      SLOW,
    );

    it.each([
      ["src/__tests__/a.ts", "export class FooError extends Error {}\n"],
      ["src/a.test.ts", "export class FooError extends Error {}\n"],
      ["e2e/a.spec.ts", "export class FooError extends Error {}\n"],
      ["e2e/helpers/mail.ts", "export class FooError extends Error {}\n"],
      [
        "src/types/sdk.d.ts",
        "export declare class FooError extends Error {}\n",
      ],
    ])(
      "does not require an own name in %s",
      async (filePath, code) => {
        expect(
          await reportsOf(name, "no-restricted-syntax", code, filePath),
        ).toEqual([]);
      },
      SLOW,
    );

    it.each([
      ["this.name = new.target.name", "    this.name = new.target.name;"],
      ["this.name = FooError.name", "    this.name = FooError.name;"],
    ])(
      "reports %s in a test file",
      async (_label, assignment) => {
        const code = [
          "export class FooError extends Error {",
          "  constructor() {",
          '    super("x");',
          assignment,
          "  }",
          "}",
          "",
        ].join("\n");
        expect(
          await reportsOf(
            name,
            "no-restricted-syntax",
            code,
            "src/__tests__/a.ts",
          ),
        ).toEqual([{ line: 4, severity: 2 }]);
      },
      SLOW,
    );

    it(
      "reports a name field read from the class name in a test file",
      async () => {
        const code =
          "export class FooError extends Error {\n  name = FooError.name;\n}\n";
        expect(
          await reportsOf(name, "no-restricted-syntax", code, "e2e/a.spec.ts"),
        ).toEqual([{ line: 2, severity: 2 }]);
      },
      SLOW,
    );

    it(
      "accepts a string name field in a source file",
      async () => {
        const code =
          'export class FooError extends Error {\n  name = "FooError";\n}\n';
        expect(
          await reportsOf(name, "no-restricted-syntax", code, "src/a.ts"),
        ).toEqual([]);
      },
      SLOW,
    );
  });
});

describe("next config", () => {
  it(
    "keeps the React Compiler rules of react-hooks as errors",
    async () => {
      expect(
        await ruleSeverity("next", "src/a.tsx", "react-hooks/purity"),
      ).toBe(2);
      expect(
        await ruleSeverity(
          "next",
          "src/a.tsx",
          "react-hooks/set-state-in-effect",
        ),
      ).toBe(2);
    },
    SLOW,
  );

  it(
    "loads eslint-config-next core-web-vitals",
    async () => {
      expect(
        await ruleSeverity("next", "src/a.tsx", "react-hooks/rules-of-hooks"),
      ).toBe(2);
      expect(
        await ruleSeverity(
          "next",
          "src/a.tsx",
          "@next/next/no-html-link-for-pages",
        ),
      ).toBe(2);
    },
    SLOW,
  );
});

describe("Node globals", () => {
  it(
    "node config knows process in an .mjs file",
    async () => {
      expect(
        await reportsOf("node", "no-undef", "process.exit(1);\n", "bin.mjs"),
      ).toEqual([]);
    },
    SLOW,
  );

  it(
    "base config without Node globals reports process in an .mjs file",
    async () => {
      expect(
        await reportsOf("base", "no-undef", "process.exit(1);\n", "bin.mjs"),
      ).toEqual([{ line: 1, severity: 2 }]);
    },
    SLOW,
  );
});

describe("restrictedSyntax(extra) appended to base", () => {
  it.each(["src/a.ts", "src/__tests__/a.ts"])(
    "reports the extra selector in %s",
    async (filePath) => {
      const messages = await lint("extra", "debugger;\n", filePath);
      expect(
        messages
          .filter((message) => message.ruleId === "no-restricted-syntax")
          .map(({ line, severity, message }) => ({ line, severity, message })),
      ).toEqual([{ line: 1, severity: 2, message: "no debugger" }]);
    },
    SLOW,
  );

  it(
    "still reports a class extending Error without its own name in a source file",
    async () => {
      expect(
        await reportsOf(
          "extra",
          "no-restricted-syntax",
          "export class FooError extends Error {}\n",
          "src/a.ts",
        ),
      ).toEqual([{ line: 1, severity: 2 }]);
    },
    SLOW,
  );

  it(
    "still reports a name read from this.constructor.name in a test file",
    async () => {
      expect(
        await reports("extra", fixture, "src/__tests__/fixture.ts"),
      ).toEqual(fixtureReportsInTests);
    },
    SLOW,
  );

  it(
    "does not require an own name in a test file",
    async () => {
      expect(
        await reportsOf(
          "extra",
          "no-restricted-syntax",
          "export class FooError extends Error {}\n",
          "src/__tests__/a.ts",
        ),
      ).toEqual([]);
    },
    SLOW,
  );
});

describe("ignores", () => {
  it("exports the test file globs", () => {
    expect(testFiles).toEqual([
      "**/__tests__/**",
      "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      "e2e/**",
    ]);
  });

  it("exports at least the build, Playwright, Stryker and report globs", () => {
    expect(ignores).toEqual(
      expect.arrayContaining([
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/blob-report/**",
        "**/playwright/.cache/**",
        "**/.stryker-tmp/**",
        "**/reports/**",
      ]),
    );
  });

  describe.each(["base", "node"] as const)("%s config", (name) => {
    it.each([
      "playwright-report/trace/index.js",
      "test-results/x.js",
      "blob-report/a.js",
      "playwright/.cache/a.js",
      "dist/a.js",
      "packages/x/dist/a.js",
      "build/a.js",
      ".next/server/a.js",
      ".turbo/a.js",
      "coverage/a.js",
      ".stryker-tmp/a.js",
      "reports/a.js",
      "node_modules/x/a.js",
    ])(
      "ignores %s",
      async (filePath) => {
        expect(await linters[name].isPathIgnored(filePath)).toBe(true);
      },
      SLOW,
    );

    it(
      "does not ignore a source file",
      async () => {
        expect(await linters[name].isPathIgnored("src/a.ts")).toBe(false);
      },
      SLOW,
    );
  });
});
