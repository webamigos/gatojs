// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function modulesRegionLines(): string[] {
  const source = readFileSync(join(process.cwd(), ".env.example"), "utf8");
  const region = source
    .split("# wa:modules:start")[1]
    ?.split("# wa:modules:end")[0];
  if (region === undefined) {
    throw new Error(".env.example has no wa:modules region");
  }
  return region.split(/\r?\n/);
}

describe(".env.example uploads variables", () => {
  it("lists an empty S3_SESSION_TOKEN right after S3_SECRET_ACCESS_KEY=minioadmin in the modules region", () => {
    const lines = modulesRegionLines();
    const secretIndex = lines.indexOf("S3_SECRET_ACCESS_KEY=minioadmin");

    expect(secretIndex).toBeGreaterThanOrEqual(0);
    expect(lines[secretIndex + 1]).toBe("S3_SESSION_TOKEN=");
  });

  it("declares S3_SESSION_TOKEN exactly once in the modules region", () => {
    expect(
      modulesRegionLines().filter((line) =>
        line.startsWith("S3_SESSION_TOKEN="),
      ),
    ).toEqual(["S3_SESSION_TOKEN="]);
  });
});
