import { fc, test } from "@fast-check/vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { manifestOf } from "../../assemble/__tests__/manifests.js";
import type { ModuleManifest } from "../../manifest/schema.js";
import { generate } from "../index.js";
import {
  regionTargets,
  renderRegionTarget,
  selfhostComposeBody,
  selfhostEnvBody,
  type RegionContext,
  type RegionTarget,
} from "../targets.js";

const tmpDirs: string[] = [];

const PROJECT = { name: "My App", slug: "my-app" };

const UPLOADS_ENV = [
  {
    name: "STORAGE_LOCAL_PATH",
    example: "./volumes/uploads",
    selfhostExample: "/app/volumes/uploads",
  },
  { name: "S3_BUCKET", example: "{{projectSlug}}-uploads" },
  {
    name: "S3_SECRET_ACCESS_KEY",
    example: "minioadmin",
    selfhostExample: "",
  },
];

async function put(dir: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content);
}

async function emptyDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gato-selfhost-"));
  tmpDirs.push(dir);
  return dir;
}

function context(
  modules: ModuleManifest[],
  projectDir = "/nonexistent-gato-selfhost",
): RegionContext {
  return { modules, projectDir, project: PROJECT };
}

function targetFor(file: string): RegionTarget {
  const target = regionTargets.find((candidate) => candidate.file === file);
  if (target === undefined) {
    throw new Error(`no region target for ${file}`);
  }
  return target;
}

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("selfhostEnvBody", () => {
  it("uses selfhostExample when set, example otherwise, and keeps an empty selfhostExample", async () => {
    expect(
      await selfhostEnvBody(
        context([manifestOf("uploads", { env: UPLOADS_ENV })]),
      ),
    ).toBe(
      "# uploads\nSTORAGE_LOCAL_PATH=/app/volumes/uploads\nS3_BUCKET=my-app-uploads\nS3_SECRET_ACCESS_KEY=",
    );
  });

  it("prefers selfhostExample over example when both are set", async () => {
    expect(
      await selfhostEnvBody(
        context([
          manifestOf("demo", {
            env: [
              { name: "DEMO_URL", example: "dev", selfhostExample: "prod" },
            ],
          }),
        ]),
      ),
    ).toBe("# demo\nDEMO_URL=prod");
  });

  it("an empty selfhostExample wins over a non-empty example", async () => {
    expect(
      await selfhostEnvBody(
        context([
          manifestOf("demo", {
            env: [
              { name: "DEMO_KEY", example: "dev-key", selfhostExample: "" },
            ],
          }),
        ]),
      ),
    ).toBe("# demo\nDEMO_KEY=");
  });

  it("fills the placeholders inside selfhostExample", async () => {
    expect(
      await selfhostEnvBody(
        context([
          manifestOf("demo", {
            env: [
              {
                name: "DEMO_TITLE",
                example: "dev",
                selfhostExample: "{{projectName}}",
              },
              {
                name: "DEMO_BUCKET",
                example: "dev",
                selfhostExample: "{{projectSlug}}-prod-{{projectSlug}}",
              },
            ],
          }),
        ]),
      ),
    ).toBe("# demo\nDEMO_TITLE=My App\nDEMO_BUCKET=my-app-prod-my-app");
  });

  it("skips the core module even when it has env", async () => {
    expect(
      await selfhostEnvBody(
        context([
          manifestOf("core", {
            env: [{ name: "CORE_X", example: "1", selfhostExample: "2" }],
          }),
          manifestOf("demo", { env: [{ name: "DEMO_X", example: "d" }] }),
        ]),
      ),
    ).toBe("# demo\nDEMO_X=d");
  });

  it("skips a module without env", async () => {
    expect(
      await selfhostEnvBody(
        context([
          manifestOf("plain"),
          manifestOf("demo", { env: [{ name: "DEMO_X", example: "d" }] }),
        ]),
      ),
    ).toBe("# demo\nDEMO_X=d");
  });

  it("separates two modules with a blank line", async () => {
    expect(
      await selfhostEnvBody(
        context([
          manifestOf("alpha", {
            env: [{ name: "ALPHA_X", example: "a", selfhostExample: "A" }],
          }),
          manifestOf("beta", { env: [{ name: "BETA_X", example: "b" }] }),
        ]),
      ),
    ).toBe("# alpha\nALPHA_X=A\n\n# beta\nBETA_X=b");
  });

  it("returns an empty string when no module has env", async () => {
    expect(
      await selfhostEnvBody(context([manifestOf("core"), manifestOf("plain")])),
    ).toBe("");
  });

  const plainValue = fc
    .string()
    .filter((value) => !value.includes("{{") && !value.includes("\n"));

  test.prop([plainValue, plainValue])(
    "a variable with selfhostExample renders that value whatever example holds",
    async (example, selfhostExample) => {
      expect(
        await selfhostEnvBody(
          context([
            manifestOf("demo", {
              env: [{ name: "DEMO_V", example, selfhostExample }],
            }),
          ]),
        ),
      ).toBe(`# demo\nDEMO_V=${selfhostExample}`);
    },
  );

  test.prop([plainValue])(
    "a variable without selfhostExample renders its example",
    async (example) => {
      expect(
        await selfhostEnvBody(
          context([manifestOf("demo", { env: [{ name: "DEMO_V", example }] })]),
        ),
      ).toBe(`# demo\nDEMO_V=${example}`);
    },
  );
});

describe("selfhostComposeBody", () => {
  it("indents the selfhostCompose file by two spaces and trims trailing newlines", async () => {
    const dir = await emptyDir();
    await put(dir, "docker/minio.selfhost.yml", "minio:\n  image: x\n");
    expect(
      await selfhostComposeBody(
        context(
          [
            manifestOf("uploads", {
              selfhostCompose: "docker/minio.selfhost.yml",
            }),
          ],
          dir,
        ),
      ),
    ).toBe("  minio:\n    image: x");
  });

  it("returns an empty string when every module has selfhostCompose null", async () => {
    const dir = await emptyDir();
    expect(
      await selfhostComposeBody(
        context([manifestOf("core"), manifestOf("plain")], dir),
      ),
    ).toBe("");
  });

  it("ignores the dev compose file of a module without selfhostCompose", async () => {
    const dir = await emptyDir();
    await put(dir, "docker/dev.yml", "dev:\n  image: dev\n");
    expect(
      await selfhostComposeBody(
        context([manifestOf("uploads", { compose: "docker/dev.yml" })], dir),
      ),
    ).toBe("");
  });

  it("reads selfhostCompose, not compose, when both are set", async () => {
    const dir = await emptyDir();
    await put(dir, "docker/dev.yml", "dev:\n  image: dev\n");
    await put(dir, "docker/prod.yml", "prod:\n  image: prod\n");
    expect(
      await selfhostComposeBody(
        context(
          [
            manifestOf("uploads", {
              compose: "docker/dev.yml",
              selfhostCompose: "docker/prod.yml",
            }),
          ],
          dir,
        ),
      ),
    ).toBe("  prod:\n    image: prod");
  });

  it("joins two modules with a newline, keeps blank lines unindented and skips modules without the file", async () => {
    const dir = await emptyDir();
    await put(dir, "a.yml", "alpha:\n  image: a\n\n  ports: []\n\n\n");
    await put(dir, "b.yml", "beta:\n  image: b\n");
    expect(
      await selfhostComposeBody(
        context(
          [
            manifestOf("alpha", { selfhostCompose: "a.yml" }),
            manifestOf("plain"),
            manifestOf("beta", { selfhostCompose: "b.yml" }),
          ],
          dir,
        ),
      ),
    ).toBe("  alpha:\n    image: a\n\n    ports: []\n  beta:\n    image: b");
  });
});

describe("regionTargets: self-host files", () => {
  it("docker-compose.selfhost.yml is filled in the services region", () => {
    expect(targetFor("docker-compose.selfhost.yml").marker).toBe("services");
  });

  it(".env.selfhost.example is filled in the modules region", () => {
    expect(targetFor(".env.selfhost.example").marker).toBe("modules");
  });

  it("each self-host file has exactly one target", () => {
    expect(
      regionTargets.filter(
        (target) =>
          target.file === "docker-compose.selfhost.yml" ||
          target.file === ".env.selfhost.example",
      ),
    ).toHaveLength(2);
  });
});

describe("renderRegionTarget: self-host files", () => {
  it(".env.selfhost.example gets the self-host values inside its region", async () => {
    const dir = await emptyDir();
    await put(
      dir,
      ".env.selfhost.example",
      "NODE_ENV=production\n# wa:modules:start\n# wa:modules:end\n",
    );
    expect(
      await renderRegionTarget(
        targetFor(".env.selfhost.example"),
        context([manifestOf("uploads", { env: UPLOADS_ENV })], dir),
      ),
    ).toEqual({
      file: ".env.selfhost.example",
      current: "NODE_ENV=production\n# wa:modules:start\n# wa:modules:end\n",
      next: "NODE_ENV=production\n# wa:modules:start\n# uploads\nSTORAGE_LOCAL_PATH=/app/volumes/uploads\nS3_BUCKET=my-app-uploads\nS3_SECRET_ACCESS_KEY=\n# wa:modules:end\n",
    });
  });

  it("docker-compose.selfhost.yml gets the selfhostCompose service, not the dev one", async () => {
    const dir = await emptyDir();
    await put(dir, "docker/dev.yml", "minio:\n  image: dev\n");
    await put(dir, "docker/prod.yml", "minio:\n  image: prod\n");
    await put(
      dir,
      "docker-compose.selfhost.yml",
      "services:\n  # wa:services:start\n  # wa:services:end\n",
    );
    const rendered = await renderRegionTarget(
      targetFor("docker-compose.selfhost.yml"),
      context(
        [
          manifestOf("uploads", {
            compose: "docker/dev.yml",
            selfhostCompose: "docker/prod.yml",
          }),
        ],
        dir,
      ),
    );
    expect(rendered?.next).toBe(
      "services:\n  # wa:services:start\n  minio:\n    image: prod\n  # wa:services:end\n",
    );
  });

  it("docker-compose.selfhost.yml in a project without that file renders nothing", async () => {
    const dir = await emptyDir();
    await put(dir, "docker/prod.yml", "minio:\n  image: prod\n");
    expect(
      await renderRegionTarget(
        targetFor("docker-compose.selfhost.yml"),
        context(
          [manifestOf("uploads", { selfhostCompose: "docker/prod.yml" })],
          dir,
        ),
      ),
    ).toBeNull();
  });

  it(".env.selfhost.example in a project without that file renders nothing", async () => {
    const dir = await emptyDir();
    expect(
      await renderRegionTarget(
        targetFor(".env.selfhost.example"),
        context([manifestOf("uploads", { env: UPLOADS_ENV })], dir),
      ),
    ).toBeNull();
  });
});

describe("generate: self-host regions", () => {
  async function makeProject(): Promise<string> {
    const dir = await emptyDir();
    const uploads = {
      name: "uploads",
      version: "1.0.0",
      description: "uploads",
      files: ["docker/**"],
      env: UPLOADS_ENV,
      compose: "docker/dev.yml",
      selfhostCompose: "docker/prod.yml",
    };
    await put(
      dir,
      ".wa/kit.json",
      JSON.stringify({
        kitVersion: "0.0.0",
        project: PROJECT,
        locales: ["pl"],
        modules: {
          uploads: { version: "1.0.0", manifest: uploads, files: {} },
        },
      }),
    );
    await put(dir, "docker/dev.yml", "minio:\n  image: dev\n");
    await put(dir, "docker/prod.yml", "minio:\n  image: prod\n");
    await put(
      dir,
      "prisma/schema/auth.prisma",
      "// wa:relations:start\n// wa:relations:end\n",
    );
    await put(
      dir,
      "prisma/schema/organizations.prisma",
      "// wa:relations:start\n// wa:relations:end\n",
    );
    await put(dir, ".env.example", "# wa:modules:start\n# wa:modules:end\n");
    await put(
      dir,
      ".env.selfhost.example",
      "# wa:modules:start\n# wa:modules:end\n",
    );
    await put(
      dir,
      "docker-compose.yml",
      "services:\n  # wa:services:start\n  # wa:services:end\n",
    );
    await put(
      dir,
      "docker-compose.selfhost.yml",
      "services:\n  # wa:services:start\n  # wa:services:end\n",
    );
    return dir;
  }

  async function read(dir: string, path: string): Promise<string> {
    return readFile(join(dir, path), "utf8");
  }

  it("fills the self-host files from selfhostCompose and selfhostExample and the dev files from compose and example", async () => {
    const dir = await makeProject();
    const { changed } = await generate(dir);
    expect(await read(dir, "docker-compose.selfhost.yml")).toBe(
      "services:\n  # wa:services:start\n  minio:\n    image: prod\n  # wa:services:end\n",
    );
    expect(await read(dir, ".env.selfhost.example")).toBe(
      "# wa:modules:start\n# uploads\nSTORAGE_LOCAL_PATH=/app/volumes/uploads\nS3_BUCKET=my-app-uploads\nS3_SECRET_ACCESS_KEY=\n# wa:modules:end\n",
    );
    expect(await read(dir, "docker-compose.yml")).toBe(
      "services:\n  # wa:services:start\n  minio:\n    image: dev\n  # wa:services:end\n",
    );
    expect(await read(dir, ".env.example")).toBe(
      "# wa:modules:start\n# uploads\nSTORAGE_LOCAL_PATH=./volumes/uploads\nS3_BUCKET=my-app-uploads\nS3_SECRET_ACCESS_KEY=minioadmin\n# wa:modules:end\n",
    );
    expect(changed).toContain("docker-compose.selfhost.yml");
    expect(changed).toContain(".env.selfhost.example");
  });

  it("a second run leaves the self-host files unchanged", async () => {
    const dir = await makeProject();
    await generate(dir);
    const { changed } = await generate(dir);
    expect(changed).not.toContain("docker-compose.selfhost.yml");
    expect(changed).not.toContain(".env.selfhost.example");
  });
});
