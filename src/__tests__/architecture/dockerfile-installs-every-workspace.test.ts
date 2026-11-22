// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDockerfileWorkspaces,
  dockerfileWorkspacesRegion,
  findDockerfileWorkspaceGaps,
  workspaceDirs,
} from "../../../scripts/lib/architecture/workspaces";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const ENV_LINE = "COPY packages/env/package.json ./packages/env/package.json";
const GONE_LINE =
  "COPY packages/gone/package.json ./packages/gone/package.json";

describe("dockerfileWorkspacesRegion", () => {
  it("returns the lines strictly between the markers", () => {
    expect(
      dockerfileWorkspacesRegion(
        `FROM base AS deps\nCOPY package.json package-lock.json ./\n# wa:workspaces:start\n${ENV_LINE}\n${GONE_LINE}\n# wa:workspaces:end\nRUN npm ci --ignore-scripts\n`,
      ),
    ).toBe(`${ENV_LINE}\n${GONE_LINE}`);
  });

  it("returns an empty string for an empty region", () => {
    expect(
      dockerfileWorkspacesRegion(
        "COPY package.json ./\n# wa:workspaces:start\n# wa:workspaces:end\nRUN npm ci\n",
      ),
    ).toBe("");
  });

  it("recognises indented marker lines", () => {
    expect(
      dockerfileWorkspacesRegion(
        `  # wa:workspaces:start\n${ENV_LINE}\n  # wa:workspaces:end\n`,
      ),
    ).toBe(ENV_LINE);
  });

  it("keeps blank lines inside the region", () => {
    expect(
      dockerfileWorkspacesRegion(
        `# wa:workspaces:start\n\n${ENV_LINE}\n# wa:workspaces:end`,
      ),
    ).toBe(`\n${ENV_LINE}`);
  });

  it.each([
    ["no markers", "FROM base\nRUN npm ci\n"],
    ["only the start marker", `# wa:workspaces:start\n${ENV_LINE}\n`],
    ["only the end marker", `${ENV_LINE}\n# wa:workspaces:end\n`],
    [
      "markers of another region",
      `# wa:modules:start\n${ENV_LINE}\n# wa:modules:end\n`,
    ],
  ])("returns null with %s", (_case, dockerfile) => {
    expect(dockerfileWorkspacesRegion(dockerfile)).toBeNull();
  });
});

describe("findDockerfileWorkspaceGaps", () => {
  it("reports a workspace on disk missing from the region", () => {
    expect(findDockerfileWorkspaceGaps(ENV_LINE, ["crypto", "env"])).toEqual([
      "missing: crypto",
    ]);
  });

  it("reports a region entry with no workspace on disk", () => {
    expect(findDockerfileWorkspaceGaps(GONE_LINE, [])).toEqual(["extra: gone"]);
  });

  it("accepts a region that matches the workspaces", () => {
    expect(
      findDockerfileWorkspaceGaps(`${ENV_LINE}\n${GONE_LINE}`, ["env", "gone"]),
    ).toEqual([]);
  });

  it("accepts an empty region without workspaces", () => {
    expect(findDockerfileWorkspaceGaps("", [])).toEqual([]);
  });

  it("reports every workspace when the region is empty", () => {
    expect(findDockerfileWorkspaceGaps("", ["env", "crypto"])).toEqual([
      "missing: env",
      "missing: crypto",
    ]);
  });

  it("ignores blank and whitespace-only lines", () => {
    expect(
      findDockerfileWorkspaceGaps(`\n   \n${ENV_LINE}\n\t\n`, ["env"]),
    ).toEqual([]);
  });

  it("accepts a COPY line with surrounding whitespace", () => {
    expect(findDockerfileWorkspaceGaps(`   ${ENV_LINE}  `, ["env"])).toEqual(
      [],
    );
  });

  it("lists missing in dirs order, then extra in region order", () => {
    expect(
      findDockerfileWorkspaceGaps(
        [
          "COPY packages/zz/package.json ./packages/zz/package.json",
          ENV_LINE,
          "COPY packages/aa/package.json ./packages/aa/package.json",
        ].join("\n"),
        ["web", "env", "api"],
      ),
    ).toEqual(["missing: web", "missing: api", "extra: zz", "extra: aa"]);
  });

  it("reports a line that is not a workspace COPY", () => {
    expect(findDockerfileWorkspaceGaps("RUN echo hi", [])).toEqual([
      "unexpected line: RUN echo hi",
    ]);
  });

  it("reports a COPY line without the ./ destination and does not count it", () => {
    expect(
      findDockerfileWorkspaceGaps(
        "COPY packages/env/package.json packages/env/package.json",
        ["env"],
      ),
    ).toEqual([
      "missing: env",
      "unexpected line: COPY packages/env/package.json packages/env/package.json",
    ]);
  });

  it("reports a COPY line whose two paths disagree", () => {
    expect(
      findDockerfileWorkspaceGaps(
        "COPY packages/a/package.json ./packages/b/package.json",
        ["a"],
      ),
    ).toEqual([
      "missing: a",
      "unexpected line: COPY packages/a/package.json ./packages/b/package.json",
    ]);
  });

  it("reports a COPY of a whole package directory", () => {
    expect(
      findDockerfileWorkspaceGaps("COPY packages/env ./packages/env", []),
    ).toEqual(["unexpected line: COPY packages/env ./packages/env"]);
  });

  it("reports the trimmed text of an unexpected line", () => {
    expect(findDockerfileWorkspaceGaps("   # note  ", [])).toEqual([
      "unexpected line: # note",
    ]);
  });

  it("reports marker lines that leaked into the region", () => {
    expect(
      findDockerfileWorkspaceGaps(
        `# wa:workspaces:start\n${ENV_LINE}\n# wa:workspaces:end`,
        ["env"],
      ),
    ).toEqual([
      "unexpected line: # wa:workspaces:start",
      "unexpected line: # wa:workspaces:end",
    ]);
  });

  it("orders missing, extra and unexpected line together", () => {
    expect(findDockerfileWorkspaceGaps(`RUN x\n${GONE_LINE}`, ["env"])).toEqual(
      ["missing: env", "extra: gone", "unexpected line: RUN x"],
    );
  });

  const namesArbitrary = fc.uniqueArray(
    fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,7}$/),
    { minLength: 1, maxLength: 6 },
  );
  const copyLine = (name: string) =>
    `COPY packages/${name}/package.json ./packages/${name}/package.json`;

  test.prop([namesArbitrary])(
    "a region listing exactly the workspaces has no gaps",
    (names) => {
      expect(
        findDockerfileWorkspaceGaps(names.map(copyLine).join("\n"), names),
      ).toEqual([]);
    },
  );

  test.prop([namesArbitrary, fc.nat()])(
    "dropping one workspace from the region reports exactly that workspace",
    (names, seed) => {
      const dropped = names[seed % names.length];
      const region = names
        .filter((name) => name !== dropped)
        .map(copyLine)
        .join("\n");

      expect(findDockerfileWorkspaceGaps(region, names)).toEqual([
        `missing: ${dropped}`,
      ]);
    },
  );
});

describe("workspaceDirs and checkDockerfileWorkspaces", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const dockerfile = (region: string[]) =>
    [
      "FROM node:22-alpine AS base",
      "FROM base AS deps",
      "COPY package.json package-lock.json ./",
      "# wa:workspaces:start",
      ...region,
      "# wa:workspaces:end",
      "RUN npm ci --ignore-scripts",
      "",
    ].join("\n");

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("workspaceDirs returns an empty list without packages", () => {
    expect(workspaceDirs(root)).toEqual([]);
  });

  it("workspaceDirs lists only directories with a package.json, by code point", () => {
    write("packages/beta/package.json", "{}");
    write("packages/alpha/package.json", "{}");
    write("packages/Zeta/package.json", "{}");
    write("packages/notes/README.md", "notes\n");
    write("packages/README.md", "readme\n");
    write("packages/package.json", "{}");

    expect(workspaceDirs(root)).toEqual(["Zeta", "alpha", "beta"]);
  });

  it("workspaceDirs does not look for package.json deeper than the package directory", () => {
    write("packages/nested/inner/package.json", "{}");

    expect(workspaceDirs(root)).toEqual([]);
  });

  it("accepts a Dockerfile whose region lists every workspace", () => {
    write("packages/env/package.json", "{}");
    write("packages/crypto/package.json", "{}");
    write(
      "Dockerfile",
      dockerfile([
        "COPY packages/crypto/package.json ./packages/crypto/package.json",
        ENV_LINE,
      ]),
    );

    expect(checkDockerfileWorkspaces(root)).toEqual([]);
  });

  it("reports a workspace missing from the region", () => {
    write("packages/env/package.json", "{}");
    write("packages/crypto/package.json", "{}");
    write("Dockerfile", dockerfile([ENV_LINE]));

    expect(checkDockerfileWorkspaces(root)).toEqual(["missing: crypto"]);
  });

  it("reports a region entry whose directory is gone", () => {
    write("Dockerfile", dockerfile([GONE_LINE]));

    expect(checkDockerfileWorkspaces(root)).toEqual(["extra: gone"]);
  });

  it("does not require a directory without a package.json", () => {
    write("packages/notes/index.ts", "export {};\n");
    write("Dockerfile", dockerfile([]));

    expect(checkDockerfileWorkspaces(root)).toEqual([]);
  });

  it("reports a Dockerfile without the region", () => {
    write(
      "Dockerfile",
      "FROM node:22-alpine\nCOPY package.json package-lock.json ./\nRUN npm ci\n",
    );

    expect(checkDockerfileWorkspaces(root)).toEqual([
      "Dockerfile: no wa:workspaces region",
    ]);
  });
});

describe("repo", () => {
  it("the Dockerfile installs every workspace on disk", () => {
    expect(checkDockerfileWorkspaces(repoRoot)).toEqual([]);
  });
});
