import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspacesBody } from "../targets.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    readdir: async (...args: Parameters<typeof original.readdir>) => {
      const entries = await original.readdir(...args);
      return [...entries].reverse();
    },
  };
});

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function addPackage(dir: string, name: string): Promise<void> {
  await mkdir(join(dir, "packages", name), { recursive: true });
  await writeFile(
    join(dir, "packages", name, "package.json"),
    JSON.stringify({ name: `@gatojs/${name}` }),
  );
}

describe("workspacesBody with directory entries listed out of order", () => {
  it("sorts packages by code point regardless of readdir order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wa-workspaces-order-"));
    tmpDirs.push(dir);
    await addPackage(dir, "alpha");
    await addPackage(dir, "Zeta");
    await addPackage(dir, "beta");

    await expect(
      workspacesBody({
        modules: [],
        projectDir: dir,
        project: { name: "Demo", slug: "demo" },
      }),
    ).resolves.toBe(
      [
        "COPY packages/Zeta/package.json ./packages/Zeta/package.json",
        "COPY packages/alpha/package.json ./packages/alpha/package.json",
        "COPY packages/beta/package.json ./packages/beta/package.json",
      ].join("\n"),
    );
  });
});
