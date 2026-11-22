import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type PackageJson = {
  name: string;
  version: string;
  files: string[];
  bin: Record<string, string>;
};

async function gatoCliPackageJson(): Promise<PackageJson> {
  return JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as PackageJson;
}

describe("gato-cli package.json", () => {
  it("is named gato-cli", async () => {
    expect((await gatoCliPackageJson()).name).toBe("gato-cli");
  });

  it("publishes only the bundle and NOTICE", async () => {
    expect((await gatoCliPackageJson()).files).toEqual([
      "dist/gato.mjs",
      "NOTICE",
    ]);
  });

  it("exposes only the gato bin pointing at the bundle", async () => {
    expect((await gatoCliPackageJson()).bin).toEqual({
      gato: "dist/gato.mjs",
    });
  });
});
