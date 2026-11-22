import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type PackageJson = {
  name: string;
  version: string;
  files?: string[];
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function readPackageJson(relative: string): Promise<PackageJson> {
  return JSON.parse(
    await readFile(new URL(relative, import.meta.url), "utf8"),
  ) as PackageJson;
}

const creator = () => readPackageJson("../../package.json");
const gatoCli = () => readPackageJson("../../../gato-cli/package.json");

describe("create-gato-app pins gato-cli", () => {
  it("depends on gato-cli 0.2.0 exactly", async () => {
    expect((await creator()).dependencies?.["gato-cli"]).toBe("0.2.0");
  });

  it("the pin is a bare x.y.z, not a range", async () => {
    expect((await creator()).dependencies?.["gato-cli"]).toMatch(
      /^\d+\.\d+\.\d+$/,
    );
  });

  it("the pin equals the gato-cli version in the workspace", async () => {
    const [creatorJson, gatoCliJson] = await Promise.all([
      creator(),
      gatoCli(),
    ]);
    expect(gatoCliJson.version).toBe("0.2.0");
    expect(creatorJson.dependencies?.["gato-cli"]).toBe(gatoCliJson.version);
  });

  it("gato-cli is a runtime dependency, not a devDependency", async () => {
    expect((await creator()).devDependencies ?? {}).not.toHaveProperty(
      "gato-cli",
    );
  });
});

describe("create-gato-app packaging", () => {
  it("publishes dist without tests and NOTICE", async () => {
    expect((await creator()).files).toEqual([
      "dist",
      "!dist/**/__tests__",
      "NOTICE",
    ]);
  });

  it("exposes only the create-gato-app bin", async () => {
    expect((await creator()).bin).toEqual({
      "create-gato-app": "dist/index.js",
    });
  });
});
