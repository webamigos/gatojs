// @vitest-environment node
import { ESLint } from "eslint";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkLintStaged,
  findLintStagedGaps,
} from "../../../scripts/lib/architecture/workspaces";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

type Workspace = {
  dir: string;
  name: string;
  hasSourceFiles: boolean;
  ownEslintConfig: boolean;
  ignoredByRootEslint: boolean;
};

const toolWorkspace: Workspace = {
  dir: "gato-cli",
  name: "gato-cli",
  hasSourceFiles: true,
  ownEslintConfig: true,
  ignoredByRootEslint: true,
};

const projectWorkspace: Workspace = {
  dir: "env",
  name: "@gatojs/env",
  hasSourceFiles: true,
  ownEslintConfig: false,
  ignoredByRootEslint: false,
};

const ROOT_ENTRY = { "*.{js,jsx,ts,tsx,mts,cts}": ["eslint --fix"] };

describe("findLintStagedGaps: workspace with its own ESLint config", () => {
  it("is covered by its own entry running ESLint in the workspace", () => {
    expect(
      findLintStagedGaps(
        {
          "packages/gato-cli/**/*.{ts,mjs}":
            "npm exec --workspace=gato-cli -- eslint --fix",
        },
        [toolWorkspace],
      ),
    ).toEqual([]);
  });

  it("is covered when any command of its entry runs ESLint in the workspace", () => {
    expect(
      findLintStagedGaps(
        {
          "packages/gato-cli/**/*.ts": [
            "prettier --write",
            "npm exec --workspace=gato-cli -- eslint --fix",
          ],
        },
        [toolWorkspace],
      ),
    ).toEqual([]);
  });

  it("is not covered by the root entry alone", () => {
    expect(findLintStagedGaps(ROOT_ENTRY, [toolWorkspace])).toEqual([
      "packages/gato-cli: no lint-staged entry runs ESLint in workspace gato-cli",
    ]);
  });

  it("is not covered by an entry naming another workspace", () => {
    expect(
      findLintStagedGaps(
        {
          "packages/gato-cli/**/*.ts":
            "npm exec --workspace=create-gato-app -- eslint --fix",
        },
        [toolWorkspace],
      ),
    ).toEqual([
      "packages/gato-cli: no lint-staged entry runs ESLint in workspace gato-cli",
    ]);
  });

  it("is not covered by an entry for another directory", () => {
    expect(
      findLintStagedGaps(
        {
          "packages/gato-cli-extra/**/*.ts":
            "npm exec --workspace=gato-cli -- eslint --fix",
          "packages/other/**/*.ts":
            "npm exec --workspace=gato-cli -- eslint --fix",
        },
        [toolWorkspace],
      ),
    ).toEqual([
      "packages/gato-cli: no lint-staged entry runs ESLint in workspace gato-cli",
    ]);
  });

  it("is not covered by an entry that runs another tool in the workspace", () => {
    expect(
      findLintStagedGaps(
        {
          "packages/gato-cli/**/*.ts":
            "npm exec --workspace=gato-cli -- prettier --write",
        },
        [toolWorkspace],
      ),
    ).toEqual([
      "packages/gato-cli: no lint-staged entry runs ESLint in workspace gato-cli",
    ]);
  });

  it("is covered when ESLint follows -- after several spaces", () => {
    const env = { ...projectWorkspace, ownEslintConfig: true };

    expect(
      findLintStagedGaps(
        {
          "packages/env/**/*.ts":
            "npm exec --workspace=@gatojs/env --  eslint --fix",
        },
        [env],
      ),
    ).toEqual([]);
  });

  it("is not covered by a workspace command that runs ESLint without --", () => {
    const env = { ...projectWorkspace, ownEslintConfig: true };

    expect(
      findLintStagedGaps(
        { "packages/env/**/*.ts": "eslint --workspace=@gatojs/env --fix" },
        [env],
      ),
    ).toEqual([
      "packages/env: no lint-staged entry runs ESLint in workspace @gatojs/env",
    ]);
  });

  it("needs the package name, not the directory name, in the command", () => {
    const env = { ...projectWorkspace, ownEslintConfig: true };

    expect(
      findLintStagedGaps(
        {
          "packages/env/**/*.ts": "npm exec --workspace=env -- eslint --fix",
        },
        [env],
      ),
    ).toEqual([
      "packages/env: no lint-staged entry runs ESLint in workspace @gatojs/env",
    ]);
    expect(
      findLintStagedGaps(
        {
          "packages/env/**/*.ts":
            "npm exec --workspace=@gatojs/env -- eslint --fix",
        },
        [env],
      ),
    ).toEqual([]);
  });
});

describe("findLintStagedGaps: workspace linted by the root config", () => {
  it("is covered by a root entry running eslint", () => {
    expect(findLintStagedGaps(ROOT_ENTRY, [projectWorkspace])).toEqual([]);
  });

  it("is covered by a root entry whose command is a single string", () => {
    expect(
      findLintStagedGaps({ "*.ts": "eslint --fix" }, [projectWorkspace]),
    ).toEqual([]);
  });

  it("is covered when any command of the root entry runs eslint", () => {
    expect(
      findLintStagedGaps({ "*.ts": ["prettier --write", "eslint --fix"] }, [
        projectWorkspace,
      ]),
    ).toEqual([]);
  });

  it("is reported when ignored by the root config", () => {
    expect(
      findLintStagedGaps(ROOT_ENTRY, [
        { ...projectWorkspace, ignoredByRootEslint: true },
      ]),
    ).toEqual([
      "packages/env: ignored by the root ESLint config and has no eslint.config of its own",
    ]);
  });

  it("is reported without any root entry", () => {
    expect(findLintStagedGaps({}, [projectWorkspace])).toEqual([
      "packages/env: no root lint-staged ESLint entry",
    ]);
  });

  it("is not covered by an entry whose key contains a slash", () => {
    expect(
      findLintStagedGaps({ "src/**/*.ts": ["eslint --fix"] }, [
        projectWorkspace,
      ]),
    ).toEqual(["packages/env: no root lint-staged ESLint entry"]);
  });

  it("is covered by a root command with leading whitespace", () => {
    expect(
      findLintStagedGaps({ "*.ts": ["  eslint --fix"] }, [projectWorkspace]),
    ).toEqual([]);
  });

  it("is not covered by a root entry without eslint", () => {
    expect(
      findLintStagedGaps(
        { "*.{json,ts}": ["prettier --write --ignore-unknown"] },
        [projectWorkspace],
      ),
    ).toEqual(["packages/env: no root lint-staged ESLint entry"]);
  });

  it("is not covered by a root command that only mentions eslint later", () => {
    expect(
      findLintStagedGaps({ "*.ts": ["npx eslint --fix", "eslint-fix-all"] }, [
        projectWorkspace,
      ]),
    ).toEqual(["packages/env: no root lint-staged ESLint entry"]);
  });
});

describe("findLintStagedGaps: input handling", () => {
  it("skips a workspace without source files", () => {
    expect(
      findLintStagedGaps({}, [
        { ...projectWorkspace, hasSourceFiles: false },
        { ...toolWorkspace, hasSourceFiles: false },
        {
          ...projectWorkspace,
          dir: "docs",
          name: "docs",
          hasSourceFiles: false,
          ignoredByRootEslint: true,
        },
      ]),
    ).toEqual([]);
  });

  it("reports workspaces in input order", () => {
    expect(
      findLintStagedGaps({}, [
        { ...projectWorkspace, dir: "zeta", name: "zeta" },
        toolWorkspace,
        { ...projectWorkspace, dir: "alpha", name: "alpha" },
      ]),
    ).toEqual([
      "packages/zeta: no root lint-staged ESLint entry",
      "packages/gato-cli: no lint-staged entry runs ESLint in workspace gato-cli",
      "packages/alpha: no root lint-staged ESLint entry",
    ]);
  });

  it("covers a tool and a project package with one config", () => {
    expect(
      findLintStagedGaps(
        {
          ...ROOT_ENTRY,
          "packages/gato-cli/**/*.{ts,mjs}":
            "npm exec --workspace=gato-cli -- eslint --fix",
        },
        [toolWorkspace, projectWorkspace],
      ),
    ).toEqual([]);
  });
});

describe("checkLintStaged", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const lintstaged = (config: Record<string, string | string[]>) =>
    write(".lintstagedrc.json", JSON.stringify(config));

  const notIgnored = async () => false;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts a repository without packages", async () => {
    lintstaged({});

    await expect(checkLintStaged(root, notIgnored)).resolves.toEqual([]);
  });

  it("accepts a project package covered by the root entry", async () => {
    lintstaged(ROOT_ENTRY);
    write("packages/env/package.json", JSON.stringify({ name: "@gatojs/env" }));
    write("packages/env/src/index.ts", "export {};\n");

    await expect(checkLintStaged(root, notIgnored)).resolves.toEqual([]);
  });

  it("reports a project package without a root entry", async () => {
    lintstaged({ "*.json": "prettier --write" });
    write("packages/env/package.json", JSON.stringify({ name: "@gatojs/env" }));
    write("packages/env/src/index.mts", "export {};\n");

    await expect(checkLintStaged(root, notIgnored)).resolves.toEqual([
      "packages/env: no root lint-staged ESLint entry",
    ]);
  });

  it("asks about the first source file in sorted order, by absolute path", async () => {
    lintstaged(ROOT_ENTRY);
    write("packages/env/package.json", JSON.stringify({ name: "@gatojs/env" }));
    write("packages/env/src/b.ts", "export {};\n");
    write("packages/env/src/a.ts", "export {};\n");
    write("packages/env/README.md", "readme\n");
    const first = path.join(root, "packages/env/src/a.ts");

    await expect(
      checkLintStaged(root, async (file: string) => file === first),
    ).resolves.toEqual([
      "packages/env: ignored by the root ESLint config and has no eslint.config of its own",
    ]);
  });

  it("asks about the first source file by code point, not by walk order", async () => {
    lintstaged(ROOT_ENTRY);
    write("packages/env/package.json", JSON.stringify({ name: "@gatojs/env" }));
    write("packages/env/src/x.ts", "export {};\n");
    write("packages/env/src-a/y.ts", "export {};\n");
    const first = path.join(root, "packages/env/src-a/y.ts");

    await expect(
      checkLintStaged(root, async (file: string) => file === first),
    ).resolves.toEqual([
      "packages/env: ignored by the root ESLint config and has no eslint.config of its own",
    ]);
  });

  it("uses the package name from package.json for a workspace with its own config", async () => {
    lintstaged({
      ...ROOT_ENTRY,
      "packages/tools/**/*.ts": "npm exec --workspace=env -- eslint --fix",
    });
    write(
      "packages/tools/package.json",
      JSON.stringify({ name: "@gatojs/tools" }),
    );
    write("packages/tools/eslint.config.mjs", "export default [];\n");
    write("packages/tools/src/index.ts", "export {};\n");

    await expect(checkLintStaged(root, notIgnored)).resolves.toEqual([
      "packages/tools: no lint-staged entry runs ESLint in workspace @gatojs/tools",
    ]);
  });

  it.each([
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    "eslint.config.mts",
    "eslint.config.cts",
  ])("treats %s as the workspace's own config", async (configFile) => {
    lintstaged({
      "packages/tools/**/*.ts":
        "npm exec --workspace=@gatojs/tools -- eslint --fix",
    });
    write(
      "packages/tools/package.json",
      JSON.stringify({ name: "@gatojs/tools" }),
    );
    write(`packages/tools/${configFile}`, "export default [];\n");
    write("packages/tools/src/index.ts", "export {};\n");

    await expect(checkLintStaged(root, async () => true)).resolves.toEqual([]);
  });

  it("does not treat eslint.config.json as the workspace's own config", async () => {
    lintstaged({
      "packages/tools/**/*.ts":
        "npm exec --workspace=@gatojs/tools -- eslint --fix",
    });
    write(
      "packages/tools/package.json",
      JSON.stringify({ name: "@gatojs/tools" }),
    );
    write("packages/tools/eslint.config.json", "{}\n");
    write("packages/tools/src/index.ts", "export {};\n");

    await expect(checkLintStaged(root, notIgnored)).resolves.toEqual([
      "packages/tools: no root lint-staged ESLint entry",
    ]);
  });

  it("skips a workspace whose only files are not source files", async () => {
    lintstaged({});
    write("packages/docs/package.json", JSON.stringify({ name: "docs" }));
    write("packages/docs/README.md", "readme\n");
    write("packages/docs/data.json", "{}\n");

    await expect(checkLintStaged(root, async () => true)).resolves.toEqual([]);
  });

  it("does not ask the ignore callback about a workspace without source files", async () => {
    lintstaged({});
    write("packages/docs/package.json", JSON.stringify({ name: "docs" }));
    write("packages/docs/README.md", "readme\n");
    const asked: string[] = [];

    await expect(
      checkLintStaged(root, async (file: string) => {
        asked.push(file);
        return true;
      }),
    ).resolves.toEqual([]);
    expect(asked).toEqual([]);
  });

  it("skips sources under node_modules and dist", async () => {
    lintstaged({});
    write("packages/env/package.json", JSON.stringify({ name: "@gatojs/env" }));
    write("packages/env/node_modules/dep/index.js", "module.exports = {};\n");
    write("packages/env/dist/index.js", "export {};\n");

    await expect(checkLintStaged(root, async () => true)).resolves.toEqual([]);
  });

  it.each([
    "x.ts",
    "x.tsx",
    "x.js",
    "x.jsx",
    "x.mjs",
    "x.cjs",
    "x.mts",
    "x.cts",
  ])("counts %s as a source file", async (file) => {
    lintstaged({});
    write("packages/env/package.json", JSON.stringify({ name: "@gatojs/env" }));
    write(`packages/env/lib/${file}`, "\n");

    await expect(checkLintStaged(root, notIgnored)).resolves.toEqual([
      "packages/env: no root lint-staged ESLint entry",
    ]);
  });

  it("skips a directory without a package.json", async () => {
    lintstaged({});
    write("packages/notes/index.ts", "export {};\n");

    await expect(checkLintStaged(root, notIgnored)).resolves.toEqual([]);
  });
});

describe("repo", () => {
  it(
    "lint-staged runs ESLint for every workspace with sources",
    { timeout: 30_000 },
    async () => {
      const eslint = new ESLint({ cwd: repoRoot });

      await expect(
        checkLintStaged(repoRoot, (file: string) => eslint.isPathIgnored(file)),
      ).resolves.toEqual([]);
    },
  );

  it.runIf(fs.existsSync(path.join(repoRoot, "packages/gato-cli")))(
    "the root ESLint config leaves gato-cli to its own config",
    { timeout: 30_000 },
    async () => {
      const eslint = new ESLint({ cwd: repoRoot });

      await expect(
        eslint.isPathIgnored(
          path.join(repoRoot, "packages/gato-cli/src/cli.ts"),
        ),
      ).resolves.toBe(true);
    },
  );
});
