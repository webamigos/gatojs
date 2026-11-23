import { describe, expect, it } from "vitest";
import { gatoBinPath } from "../gato-bin.js";

describe("gatoBinPath", () => {
  it("joins the package directory with bin.gato", () => {
    expect(
      gatoBinPath("/nm/gato-cli/package.json", {
        name: "gato-cli",
        bin: { gato: "dist/gato.mjs" },
      }),
    ).toBe("/nm/gato-cli/dist/gato.mjs");
  });

  it("normalises a ./ prefix in bin.gato", () => {
    expect(
      gatoBinPath("/a/b/node_modules/gato-cli/package.json", {
        bin: { gato: "./dist/gato.mjs" },
      }),
    ).toBe("/a/b/node_modules/gato-cli/dist/gato.mjs");
  });

  it("uses the gato entry when other bins are present", () => {
    expect(
      gatoBinPath("/nm/gato-cli/package.json", {
        bin: { wa: "dist/wa.mjs", gato: "dist/gato.mjs" },
      }),
    ).toBe("/nm/gato-cli/dist/gato.mjs");
  });

  it.each([
    ["no bin", { name: "gato-cli" }],
    ["a string bin", { bin: "dist/gato.mjs" }],
    ["no gato entry", { bin: { wa: "dist/wa.mjs" } }],
    ["a numeric gato entry", { bin: { gato: 1 } }],
    ["a null gato entry", { bin: { gato: null } }],
    ["a null bin", { bin: null }],
    ["null", null],
    ["undefined", undefined],
    ["a string", "gato-cli"],
    ["an array", [{ bin: { gato: "dist/gato.mjs" } }]],
  ])("%s throws that gato-cli has no gato bin", (_label, packageJson) => {
    expect(() => gatoBinPath("/nm/gato-cli/package.json", packageJson)).toThrow(
      /gato-cli[\s\S]*no "gato" bin|no "gato" bin[\s\S]*gato-cli/,
    );
  });
});
