import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDirs } from "../../__tests__/helpers.js";
import { copyFiles } from "../copy.js";
import { testConfig } from "./manifests.js";

const names = { name: "Acme Shop", slug: "acme-shop", snake: "acme_shop" };

afterEach(removeTempDirs);

async function seed(dir: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), content);
  }
}

describe("copyFiles", () => {
  it("tworzy katalogi posrednie, podmienia placeholdery i zwraca hashe", async () => {
    const kitDir = await makeTempDir();
    const projectDir = await makeTempDir();
    await seed(kitDir, {
      "src/shared/config/project.ts": 'name: "WA App", slug: "wa-app"',
      "src/deep/er/file.ts": '"WA App"',
    });
    const hashes = await copyFiles({
      kitDir,
      projectDir,
      files: ["src/shared/config/project.ts", "src/deep/er/file.ts"],
      config: testConfig,
      names,
    });
    expect(
      await readFile(join(projectDir, "src/shared/config/project.ts"), "utf8"),
    ).toBe('name: "Acme Shop", slug: "acme-shop"');
    expect(
      await readFile(join(projectDir, "src/deep/er/file.ts"), "utf8"),
    ).toBe('"WA App"');
    expect(hashes).toEqual({
      "src/shared/config/project.ts":
        "8118df36616bbf62cc06d8fae78aa69d324a4859cf2d748b61da573f66c0430d",
      "src/deep/er/file.ts":
        "3c2cba5edbdd26c5206bfbe86d3408841829fbd19396aa38249faa6283d4afdb",
    });
  });

  it("zachowuje bit wykonywalnosci", async () => {
    const kitDir = await makeTempDir();
    const projectDir = await makeTempDir();
    await seed(kitDir, { "scripts/run.sh": "#!/bin/sh\n", "plain.txt": "x" });
    await chmod(join(kitDir, "scripts/run.sh"), 0o755);
    await chmod(join(kitDir, "plain.txt"), 0o644);
    await copyFiles({
      kitDir,
      projectDir,
      files: ["scripts/run.sh", "plain.txt"],
      config: testConfig,
      names,
    });
    expect((await stat(join(projectDir, "scripts/run.sh"))).mode & 0o777).toBe(
      0o755,
    );
    expect((await stat(join(projectDir, "plain.txt"))).mode & 0o111).toBe(0);
  });

  it("package.json dostaje hash managed i podmienione placeholdery", async () => {
    const kitDir = await makeTempDir();
    const projectDir = await makeTempDir();
    await seed(kitDir, { "package.json": '{"name":"wa-app"}' });
    const hashes = await copyFiles({
      kitDir,
      projectDir,
      files: ["package.json"],
      config: testConfig,
      names,
    });
    expect(await readFile(join(projectDir, "package.json"), "utf8")).toBe(
      '{"name":"acme-shop"}',
    );
    expect(hashes).toEqual({ "package.json": "managed" });
  });

  it("plik binarny spoza placeholderow kopiuje bajt w bajt i hashuje surowe bajty", async () => {
    const kitDir = await makeTempDir();
    const projectDir = await makeTempDir();
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x89, 0x50, 0x4e, 0x47]);
    await writeFile(join(kitDir, "logo.bin"), bytes);
    const hashes = await copyFiles({
      kitDir,
      projectDir,
      files: ["logo.bin"],
      config: testConfig,
      names,
    });
    expect(await readFile(join(projectDir, "logo.bin"))).toEqual(bytes);
    expect(hashes).toEqual({
      "logo.bin":
        "6a6e6599d88a9a8c7831b7de8a5451e9a2ccab385dafe8dfcf0a2db44894128c",
    });
  });

  it("pusta lista plikow daje pusty wynik", async () => {
    const kitDir = await makeTempDir();
    const projectDir = await makeTempDir();
    expect(
      await copyFiles({
        kitDir,
        projectDir,
        files: [],
        config: testConfig,
        names,
      }),
    ).toEqual({});
  });
});
