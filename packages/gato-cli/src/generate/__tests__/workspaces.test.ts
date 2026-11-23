import { fc, test } from "@fast-check/vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentHash } from "../../assemble/hash.js";
import { generate } from "../index.js";
import { REGION_FILES, workspacesBody } from "../targets.js";

const tmpDirs: string[] = [];

const DOCKERFILE = [
  "FROM node:22-alpine AS base",
  "",
  "FROM base AS deps",
  "WORKDIR /app",
  "",
  "COPY package.json package-lock.json ./",
  "# wa:workspaces:start",
  "# wa:workspaces:end",
  "RUN npm ci --ignore-scripts",
  "",
  "FROM base AS builder",
  "COPY . .",
  "",
].join("\n");

const DOCKERFILE_WITHOUT_MARKERS = [
  "FROM node:22-alpine AS base",
  "",
  "FROM base AS deps",
  "WORKDIR /app",
  "",
  "COPY package.json package-lock.json ./",
  "RUN npm ci --ignore-scripts",
  "",
].join("\n");

async function put(dir: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content);
}

async function emptyDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wa-workspaces-"));
  tmpDirs.push(dir);
  return dir;
}

async function makeProject(dockerfile: string | null): Promise<string> {
  const dir = await emptyDir();
  await put(
    dir,
    ".wa/kit.json",
    JSON.stringify({
      kitVersion: "0.0.0",
      locales: ["pl"],
      modules: {
        alpha: {
          version: "1.0.0",
          manifest: {
            name: "alpha",
            version: "1.0.0",
            description: "alpha",
            files: ["src/features/alpha/**"],
            ciSteps: null,
            env: [],
          },
          files: {},
        },
      },
    }),
  );
  await put(dir, "src/features/alpha/module.ts", "export default {};");
  if (dockerfile !== null) {
    await put(dir, "Dockerfile", dockerfile);
  }
  return dir;
}

async function addPackage(dir: string, name: string): Promise<void> {
  await put(
    dir,
    `packages/${name}/package.json`,
    JSON.stringify({ name: `@gatojs/${name}` }),
  );
}

function body(projectDir: string): Promise<string> {
  return workspacesBody({
    modules: [],
    projectDir,
    project: { name: "Demo", slug: "demo" },
  });
}

async function readDockerfile(dir: string): Promise<string> {
  return readFile(join(dir, "Dockerfile"), "utf8");
}

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("workspacesBody", () => {
  it("lists one COPY line per package with a package.json", async () => {
    const dir = await emptyDir();
    await addPackage(dir, "observability");
    await addPackage(dir, "env");

    expect(await body(dir)).toBe(
      "COPY packages/env/package.json ./packages/env/package.json\nCOPY packages/observability/package.json ./packages/observability/package.json",
    );
  });

  it("returns an empty string without a packages directory", async () => {
    const dir = await emptyDir();

    expect(await body(dir)).toBe("");
  });

  it("returns an empty string when packages is empty", async () => {
    const dir = await emptyDir();
    await mkdir(join(dir, "packages"));

    expect(await body(dir)).toBe("");
  });

  it("ignores a package directory without a package.json", async () => {
    const dir = await emptyDir();
    await addPackage(dir, "env");
    await put(dir, "packages/notes/README.md", "notes\n");

    expect(await body(dir)).toBe(
      "COPY packages/env/package.json ./packages/env/package.json",
    );
  });

  it("returns an empty string when the only package directory has no package.json", async () => {
    const dir = await emptyDir();
    await put(dir, "packages/notes/index.ts", "export {};\n");

    expect(await body(dir)).toBe("");
  });

  it("ignores a plain file directly in packages", async () => {
    const dir = await emptyDir();
    await put(dir, "packages/README.md", "readme\n");
    await put(dir, "packages/package.json", "{}");
    await addPackage(dir, "env");

    expect(await body(dir)).toBe(
      "COPY packages/env/package.json ./packages/env/package.json",
    );
  });

  it("ignores a package directory whose package.json is a directory", async () => {
    const dir = await emptyDir();
    await mkdir(join(dir, "packages/weird/package.json"), { recursive: true });

    expect(await body(dir)).toBe("");
  });

  it("orders packages by code point, not by locale", async () => {
    const dir = await emptyDir();
    await addPackage(dir, "beta");
    await addPackage(dir, "alpha");
    await addPackage(dir, "Zeta");

    expect(await body(dir)).toBe(
      [
        "COPY packages/Zeta/package.json ./packages/Zeta/package.json",
        "COPY packages/alpha/package.json ./packages/alpha/package.json",
        "COPY packages/beta/package.json ./packages/beta/package.json",
      ].join("\n"),
    );
  });

  it("propagates a stat error other than ENOENT for a package.json", async () => {
    const dir = await emptyDir();
    await mkdir(join(dir, "packages/env"), { recursive: true });
    await symlink(
      join(dir, "packages/env/package.json"),
      join(dir, "packages/env/package.json"),
    );

    await expect(body(dir)).rejects.toMatchObject({ code: "ELOOP" });
  });

  it("propagates a readdir error other than ENOENT for packages", async () => {
    const dir = await emptyDir();
    await put(dir, "packages", "not a directory\n");

    await expect(body(dir)).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("does not end with a newline", async () => {
    const dir = await emptyDir();
    await addPackage(dir, "env");

    expect((await body(dir)).endsWith("\n")).toBe(false);
  });

  test.prop(
    [
      fc.uniqueArray(fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,7}$/), {
        minLength: 1,
        maxLength: 5,
      }),
    ],
    { numRuns: 15 },
  )(
    "every line copies one package manifest to the same path and lines are sorted",
    async (names) => {
      const dir = await emptyDir();
      for (const name of names) {
        await addPackage(dir, name);
      }

      const lines = (await body(dir)).split("\n");

      expect(lines).toHaveLength(names.length);
      const listed = lines.map((line) => {
        const match =
          /^COPY packages\/([^/]+)\/package\.json \.\/packages\/([^/]+)\/package\.json$/.exec(
            line,
          );
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe(match?.[2]);
        return match?.[1] ?? "";
      });
      expect(new Set(listed)).toEqual(new Set(names));
      for (let index = 1; index < listed.length; index += 1) {
        expect(listed[index - 1] < listed[index]).toBe(true);
      }
    },
  );
});

describe("Dockerfile workspaces region target", () => {
  it("REGION_FILES contains the Dockerfile", () => {
    expect(REGION_FILES).toContain("Dockerfile");
  });

  it("contentHash ignores the body of the workspaces region in the Dockerfile", () => {
    const empty = Buffer.from(DOCKERFILE);
    const filled = Buffer.from(
      DOCKERFILE.replace(
        "# wa:workspaces:start\n",
        "# wa:workspaces:start\nCOPY packages/env/package.json ./packages/env/package.json\n",
      ),
    );

    expect(contentHash("Dockerfile", filled)).toBe(
      contentHash("Dockerfile", empty),
    );
  });

  it("contentHash still sees changes outside the workspaces region", () => {
    const original = Buffer.from(DOCKERFILE);
    const changed = Buffer.from(
      DOCKERFILE.replace("RUN npm ci --ignore-scripts", "RUN npm install"),
    );

    expect(contentHash("Dockerfile", changed)).not.toBe(
      contentHash("Dockerfile", original),
    );
  });
});

describe("generate: wa:workspaces region in the Dockerfile", () => {
  it("fills the region with every package, in code point order", async () => {
    const dir = await makeProject(DOCKERFILE);
    await addPackage(dir, "observability");
    await addPackage(dir, "env");
    await put(dir, "packages/notes/README.md", "notes\n");

    const { changed } = await generate(dir);

    expect(await readDockerfile(dir)).toBe(
      [
        "FROM node:22-alpine AS base",
        "",
        "FROM base AS deps",
        "WORKDIR /app",
        "",
        "COPY package.json package-lock.json ./",
        "# wa:workspaces:start",
        "COPY packages/env/package.json ./packages/env/package.json",
        "COPY packages/observability/package.json ./packages/observability/package.json",
        "# wa:workspaces:end",
        "RUN npm ci --ignore-scripts",
        "",
        "FROM base AS builder",
        "COPY . .",
        "",
      ].join("\n"),
    );
    expect(changed).toContain("Dockerfile");
  });

  it("leaves an empty region untouched without packages", async () => {
    const dir = await makeProject(DOCKERFILE);

    const { changed } = await generate(dir);

    expect(await readDockerfile(dir)).toBe(DOCKERFILE);
    expect(changed).not.toContain("Dockerfile");
  });

  it("is idempotent on a second run", async () => {
    const dir = await makeProject(DOCKERFILE);
    await addPackage(dir, "env");
    await generate(dir);
    const first = await readDockerfile(dir);

    const { changed } = await generate(dir);

    expect(await readDockerfile(dir)).toBe(first);
    expect(changed).not.toContain("Dockerfile");
  });

  it("empties the region after the listed package is deleted", async () => {
    const dir = await makeProject(DOCKERFILE);
    await addPackage(dir, "env");
    await generate(dir);
    await rm(join(dir, "packages/env"), { recursive: true, force: true });

    await generate(dir);

    expect(await readDockerfile(dir)).toBe(DOCKERFILE);
  });

  it("leaves a Dockerfile without markers byte-identical when there are no packages", async () => {
    const dir = await makeProject(DOCKERFILE_WITHOUT_MARKERS);

    const { changed } = await generate(dir);

    expect(await readDockerfile(dir)).toBe(DOCKERFILE_WITHOUT_MARKERS);
    expect(changed).not.toContain("Dockerfile");
  });

  it("rejects a Dockerfile without markers when a package exists", async () => {
    const dir = await makeProject(DOCKERFILE_WITHOUT_MARKERS);
    await addPackage(dir, "env");

    await expect(generate(dir)).rejects.toThrow("wa:workspaces");
    expect(await readDockerfile(dir)).toBe(DOCKERFILE_WITHOUT_MARKERS);
  });

  it("skips a project without a Dockerfile and does not create one", async () => {
    const dir = await makeProject(null);
    await addPackage(dir, "env");

    await generate(dir);

    await expect(stat(join(dir, "Dockerfile"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
