// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkTestRunners,
  compareCodePoint,
  findTestRunnerGaps,
  matchedByPackagesProject,
  PACKAGES_TEST_INCLUDE,
  TOOL_PACKAGES,
  workspaceDirs,
} from "../../../scripts/lib/architecture/workspaces";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("TOOL_PACKAGES and PACKAGES_TEST_INCLUDE", () => {
  it("lists exactly the tool packages with their own runner", () => {
    expect(TOOL_PACKAGES).toEqual(["create-gato-app", "gato-cli"]);
  });

  it("is the include of the root packages Vitest project", () => {
    expect(PACKAGES_TEST_INCLUDE).toBe("packages/*/src/**/*.test.ts");
  });
});

describe("compareCodePoint", () => {
  it.each([
    ["a", "b", -1],
    ["b", "a", 1],
    ["a", "a", 0],
    ["Z", "a", -1],
  ])("compares %s with %s as %d", (a, b, expected) => {
    expect(compareCodePoint(a, b)).toBe(expected);
  });

  test.prop([fc.string(), fc.string()])("is antisymmetric", (a, b) => {
    expect(Math.sign(compareCodePoint(a, b))).toBe(
      -Math.sign(compareCodePoint(b, a)),
    );
  });

  test.prop([fc.string()])("compares a string with itself as 0", (a) => {
    expect(compareCodePoint(a, a)).toBe(0);
  });
});

describe("matchedByPackagesProject", () => {
  it.each([
    "packages/env/src/parse.test.ts",
    "packages/env/src/a/b/__tests__/x.test.ts",
    "packages/env/src/__tests__/x.test.ts",
    "packages/observability/src/log.test.ts",
  ])("matches %s", (file) => {
    expect(matchedByPackagesProject(file)).toBe(true);
  });

  it.each([
    "packages/env/test/x.test.ts",
    "packages/env/src/x.test.tsx",
    "packages/env/src/x.spec.ts",
    "packages/env/src/x.test.js",
    "packages/env/src/x.test.mts",
    "packages/a/b/src/x.test.ts",
    "src/x.test.ts",
    "packages/env/src/x.test.ts.snap",
    "packages/env/src/xtest.ts",
    "packages/env/x.test.ts",
    "packages/env/srcx/x.test.ts",
    "xpackages/env/src/x.test.ts",
    "apps/web/packages/env/src/x.test.ts",
  ])("does not match %s", (file) => {
    expect(matchedByPackagesProject(file)).toBe(false);
  });

  test.prop([
    fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/),
    fc.array(fc.stringMatching(/^[a-z_][a-z0-9_]{0,5}$/), { maxLength: 3 }),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/),
  ])("matches a .test.ts file at any depth under src", (pkg, dirs, name) => {
    const file = ["packages", pkg, "src", ...dirs, `${name}.test.ts`].join("/");

    expect(matchedByPackagesProject(file)).toBe(true);
  });
});

describe("findTestRunnerGaps", () => {
  it("accepts a project package without a test script whose tests are in src", () => {
    expect(
      findTestRunnerGaps([
        {
          dir: "env",
          scripts: { typecheck: "tsc --noEmit", "test:watch": "vitest" },
          testFiles: ["packages/env/src/parse.test.ts"],
        },
      ]),
    ).toEqual([]);
  });

  it("reports a project package that declares its own test script", () => {
    expect(
      findTestRunnerGaps([
        { dir: "env", scripts: { test: "vitest run" }, testFiles: [] },
      ]),
    ).toEqual(["packages/env: project package declares its own test script"]);
  });

  it("reports each project test file the root project does not include", () => {
    expect(
      findTestRunnerGaps([
        {
          dir: "env",
          scripts: {},
          testFiles: [
            "packages/env/src/a.spec.ts",
            "packages/env/src/ok.test.ts",
            "packages/env/test/x.test.ts",
          ],
        },
      ]),
    ).toEqual([
      "packages/env/src/a.spec.ts: not in the root packages Vitest project",
      "packages/env/test/x.test.ts: not in the root packages Vitest project",
    ]);
  });

  it("reports the test script before the test files of the same package", () => {
    expect(
      findTestRunnerGaps([
        {
          dir: "env",
          scripts: { test: "vitest run" },
          testFiles: ["packages/env/test/x.test.ts"],
        },
      ]),
    ).toEqual([
      "packages/env: project package declares its own test script",
      "packages/env/test/x.test.ts: not in the root packages Vitest project",
    ]);
  });

  it.each(["gato-cli", "create-gato-app"])(
    "accepts the tool package %s with its own test script and tests anywhere",
    (dir) => {
      expect(
        findTestRunnerGaps([
          {
            dir,
            scripts: { test: "vitest run" },
            testFiles: [
              `packages/${dir}/test/x.test.ts`,
              `packages/${dir}/src/y.spec.tsx`,
            ],
          },
        ]),
      ).toEqual([]);
    },
  );

  it.each(["gato-cli", "create-gato-app"])(
    "reports the tool package %s without a test script",
    (dir) => {
      expect(
        findTestRunnerGaps([
          {
            dir,
            scripts: { typecheck: "tsc" },
            testFiles: [`packages/${dir}/test/x.test.ts`],
          },
        ]),
      ).toEqual([
        `packages/${dir}: tool package has no test script of its own`,
      ]);
    },
  );

  it("treats a package whose name only resembles a tool as a project package", () => {
    expect(
      findTestRunnerGaps([
        { dir: "gato-cli-extra", scripts: { test: "vitest" }, testFiles: [] },
        { dir: "cli", scripts: { test: "vitest" }, testFiles: [] },
      ]),
    ).toEqual([
      "packages/gato-cli-extra: project package declares its own test script",
      "packages/cli: project package declares its own test script",
    ]);
  });

  it("reports workspaces in input order", () => {
    expect(
      findTestRunnerGaps([
        { dir: "zeta", scripts: { test: "vitest" }, testFiles: [] },
        { dir: "gato-cli", scripts: {}, testFiles: [] },
        { dir: "alpha", scripts: { test: "vitest" }, testFiles: [] },
      ]),
    ).toEqual([
      "packages/zeta: project package declares its own test script",
      "packages/gato-cli: tool package has no test script of its own",
      "packages/alpha: project package declares its own test script",
    ]);
  });

  it("accepts no workspaces", () => {
    expect(findTestRunnerGaps([])).toEqual([]);
  });
});

describe("checkTestRunners", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const packageJson = (scripts?: Record<string, string>) =>
    JSON.stringify(
      scripts === undefined ? { name: "x" } : { name: "x", scripts },
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts a repository without packages", () => {
    expect(checkTestRunners(root)).toEqual([]);
  });

  it("lists workspaces in code point order when readdir returns them reversed", () => {
    write("packages/alpha/package.json", packageJson());
    write("packages/zeta/package.json", packageJson());
    const packagesDir = path.join(root, "packages");
    const readdirSync = fs.readdirSync;
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((
      dir: fs.PathLike,
      options?: unknown,
    ) => {
      const entries = (
        readdirSync as (dir: fs.PathLike, options?: unknown) => unknown[]
      )(dir, options);
      return dir === packagesDir ? [...entries].reverse() : entries;
    }) as typeof fs.readdirSync);

    try {
      expect(workspaceDirs(root)).toEqual(["alpha", "zeta"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("reports project packages in code point order when readdir returns them reversed", () => {
    write("packages/alpha/package.json", packageJson({ test: "vitest" }));
    write("packages/zeta/package.json", packageJson({ test: "vitest" }));
    const packagesDir = path.join(root, "packages");
    const readdirSync = fs.readdirSync;
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((
      dir: fs.PathLike,
      options?: unknown,
    ) => {
      const entries = (
        readdirSync as (dir: fs.PathLike, options?: unknown) => unknown[]
      )(dir, options);
      return dir === packagesDir ? [...entries].reverse() : entries;
    }) as typeof fs.readdirSync);

    try {
      expect(checkTestRunners(root)).toEqual([
        "packages/alpha: project package declares its own test script",
        "packages/zeta: project package declares its own test script",
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it("accepts a project package whose tests the root project includes", () => {
    write("packages/env/package.json", packageJson({ typecheck: "tsc" }));
    write("packages/env/src/parse.test.ts", "");
    write("packages/env/src/__tests__/deep.test.ts", "");

    expect(checkTestRunners(root)).toEqual([]);
  });

  it("accepts a package.json without scripts", () => {
    write("packages/env/package.json", packageJson());
    write("packages/env/src/parse.test.ts", "");

    expect(checkTestRunners(root)).toEqual([]);
  });

  it("reports a project package with its own test script", () => {
    write("packages/env/package.json", packageJson({ test: "vitest run" }));

    expect(checkTestRunners(root)).toEqual([
      "packages/env: project package declares its own test script",
    ]);
  });

  it("reports project test files outside the root project, sorted", () => {
    write("packages/env/package.json", packageJson());
    write("packages/env/test/x.test.ts", "");
    write("packages/env/src/a.spec.tsx", "");
    write("packages/env/src/b.test.mjs", "");
    write("packages/env/src/c.spec.cts", "");

    expect(checkTestRunners(root)).toEqual([
      "packages/env/src/a.spec.tsx: not in the root packages Vitest project",
      "packages/env/src/b.test.mjs: not in the root packages Vitest project",
      "packages/env/src/c.spec.cts: not in the root packages Vitest project",
      "packages/env/test/x.test.ts: not in the root packages Vitest project",
    ]);
  });

  it("sorts reported test files by code point, not by walk order", () => {
    write("packages/env/package.json", packageJson());
    write("packages/env/test/x.test.ts", "");
    write("packages/env/test-a/y.test.ts", "");

    expect(checkTestRunners(root)).toEqual([
      "packages/env/test-a/y.test.ts: not in the root packages Vitest project",
      "packages/env/test/x.test.ts: not in the root packages Vitest project",
    ]);
  });

  it("does not report a symlinked test file", () => {
    write("packages/env/package.json", packageJson());
    write("elsewhere/x.test.ts", "");
    fs.mkdirSync(path.join(root, "packages/env/test"), { recursive: true });
    fs.symlinkSync(
      path.join(root, "elsewhere/x.test.ts"),
      path.join(root, "packages/env/test/x.test.ts"),
    );

    expect(checkTestRunners(root)).toEqual([]);
  });

  it("does not treat snapshots or look-alike names as test files", () => {
    write("packages/env/package.json", packageJson());
    write("packages/env/test/x.test.ts.snap", "");
    write("packages/env/test/x.testing.ts", "");
    write("packages/env/test/fixtures.json", "");

    expect(checkTestRunners(root)).toEqual([]);
  });

  it("skips node_modules and dist", () => {
    write("packages/env/package.json", packageJson());
    write("packages/env/node_modules/dep/x.test.ts", "");
    write("packages/env/dist/x.test.js", "");

    expect(checkTestRunners(root)).toEqual([]);
  });

  it("skips a directory without a package.json", () => {
    write("packages/notes/test/x.test.ts", "");

    expect(checkTestRunners(root)).toEqual([]);
  });

  it("does not report a tool package with its own runner", () => {
    write(
      "packages/gato-cli/package.json",
      packageJson({ test: "vitest run" }),
    );
    write("packages/gato-cli/test/x.test.ts", "");

    expect(checkTestRunners(root)).toEqual([]);
  });

  it("reports a tool package without a test script", () => {
    write("packages/gato-cli/package.json", packageJson({ build: "node b" }));

    expect(checkTestRunners(root)).toEqual([
      "packages/gato-cli: tool package has no test script of its own",
    ]);
  });
});

describe("repo", () => {
  it("every workspace has exactly one test runner", () => {
    expect(checkTestRunners(repoRoot)).toEqual([]);
  });

  it.runIf(fs.existsSync(path.join(repoRoot, "kit/kit.json")))(
    "the check sees the gato-cli tool package in the GatoJS repo",
    () => {
      expect(workspaceDirs(repoRoot)).toContain("gato-cli");
    },
  );
});
