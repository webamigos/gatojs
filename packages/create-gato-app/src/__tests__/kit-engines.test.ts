import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeRangesFromPackageJson, readKitPackageJson } from "../kit-engines.js";

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-gato-app-engines-"));
  createdDirs.push(dir);
  return dir;
}

describe("nodeRangesFromPackageJson", () => {
  it("engines.node kitu daje sparsowane zakresy bez ostrzeżenia", () => {
    expect(nodeRangesFromPackageJson({ engines: { node: "^22.12.0 || ^24.0.0" } })).toEqual({
      ranges: [
        { from: "22.12.0", belowMajor: 23 },
        { from: "24.0.0", belowMajor: 25 },
      ],
      warning: null,
    });
  });

  it.each([[{}], [{ engines: {} }], [null], ["x"], [{ engines: null }], [[]]])(
    "%j bez engines.node daje wbudowane >=22 bez ostrzeżenia",
    (packageJson) => {
      expect(nodeRangesFromPackageJson(packageJson)).toEqual({
        ranges: [{ from: "22.0.0" }],
        warning: null,
      });
    },
  );

  it("niezrozumiały zakres daje >=22 i ostrzeżenie z tym zakresem", () => {
    expect(nodeRangesFromPackageJson({ engines: { node: "22.x" } })).toEqual({
      ranges: [{ from: "22.0.0" }],
      warning: `The kit's Node range "22.x" is not one create-gato-app understands; checking against >=22 instead.`,
    });
  });
});

describe("readKitPackageJson", () => {
  it("zwraca sparsowany package.json z katalogu kitu", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "gatojs", engines: { node: "^22.12.0" } }),
    );
    await expect(readKitPackageJson(dir)).resolves.toEqual({
      name: "gatojs",
      engines: { node: "^22.12.0" },
    });
  });

  it("katalog bez package.json nie jest checkoutem GatoJS", async () => {
    const dir = await tempDir();
    await expect(readKitPackageJson(dir)).rejects.toThrow(
      `${dir} is not a GatoJS checkout (no package.json)`,
    );
  });
});
