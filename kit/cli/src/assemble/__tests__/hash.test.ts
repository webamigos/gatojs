import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fileHash, stripRegions } from "../hash.js";
import { testConfig } from "./manifests.js";

const lineArbitrary = fc
  .string({ maxLength: 20 })
  .filter((line) => !/[\r\n]/.test(line) && !line.includes("wa:"));
const linesArbitrary = fc.array(lineArbitrary, { maxLength: 5 });
const outsideArbitrary = fc.array(lineArbitrary, { maxLength: 4 });

const withRegion = (before: string[], inner: string[], after: string[]) =>
  [
    ...before,
    "# wa:modules:start",
    ...inner,
    "# wa:modules:end",
    ...after,
    "",
  ].join("\n");

describe("stripRegions", () => {
  it("dwa regiony: oba puste, znaczniki i tresc poza nimi bez zmian", () => {
    const content = [
      "head",
      "# wa:modules:start",
      "A=1",
      "B=2",
      "# wa:modules:end",
      "middle",
      "# wa:services:start",
      "  db:",
      "# wa:services:end",
      "tail",
      "",
    ].join("\n");
    expect(stripRegions(content)).toBe(
      [
        "head",
        "# wa:modules:start",
        "# wa:modules:end",
        "middle",
        "# wa:services:start",
        "# wa:services:end",
        "tail",
        "",
      ].join("\n"),
    );
  });

  it("region z komentarzem slash zostawia znaczniki", () => {
    expect(
      stripRegions(
        "a\n// wa:relations:start\nposts Post[]\n// wa:relations:end\nb\n",
      ),
    ).toBe("a\n// wa:relations:start\n// wa:relations:end\nb\n");
  });

  it("pusty region zostaje bez zmian", () => {
    const content = "# wa:modules:start\n# wa:modules:end\n";
    expect(stripRegions(content)).toBe(content);
  });

  it("tresc bez regionow zostaje bez zmian", () => {
    expect(stripRegions("a\nb\n")).toBe("a\nb\n");
  });

  test.prop([outsideArbitrary, linesArbitrary, outsideArbitrary])(
    "jest idempotentne",
    (before, inner, after) => {
      const once = stripRegions(withRegion(before, inner, after));
      expect(stripRegions(once)).toBe(once);
    },
  );

  test.prop([
    outsideArbitrary,
    linesArbitrary,
    linesArbitrary,
    outsideArbitrary,
  ])("wynik nie zalezy od tresci regionu", (before, innerA, innerB, after) => {
    expect(stripRegions(withRegion(before, innerA, after))).toBe(
      stripRegions(withRegion(before, innerB, after)),
    );
  });

  test.prop([outsideArbitrary, linesArbitrary, outsideArbitrary])(
    "zachowuje znaczniki i linie poza regionem",
    (before, inner, after) => {
      expect(stripRegions(withRegion(before, inner, after))).toBe(
        withRegion(before, [], after),
      );
    },
  );
});

describe("fileHash", () => {
  it("to 64 znaki hex, wartosc sha256 dla znanej tresci", () => {
    expect(fileHash("src/a.ts", "abc", testConfig)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("jest sha256 hex", () => {
    expect(fileHash("src/a.ts", "x", testConfig)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("nie zalezy od tresci regionow", () => {
    const a = "x\n# wa:modules:start\nA=1\n# wa:modules:end\n";
    const b = "x\n# wa:modules:start\n# wa:modules:end\n";
    expect(fileHash(".env.example", a, testConfig)).toBe(
      fileHash(".env.example", b, testConfig),
    );
  });

  it("zmienia sie przy zmianie tresci poza regionem", () => {
    const a = "x\n# wa:modules:start\n# wa:modules:end\n";
    const b = "y\n# wa:modules:start\n# wa:modules:end\n";
    expect(fileHash(".env.example", a, testConfig)).not.toBe(
      fileHash(".env.example", b, testConfig),
    );
  });

  it("package.json i package-lock.json maja hash managed", () => {
    expect(fileHash("package.json", "{}", testConfig)).toBe("managed");
    expect(fileHash("package-lock.json", "{}", testConfig)).toBe("managed");
  });

  it("zwykly plik nie dostaje managed", () => {
    expect(fileHash("src/package.json", "{}", testConfig)).not.toBe("managed");
  });

  test.prop([
    outsideArbitrary,
    linesArbitrary,
    linesArbitrary,
    outsideArbitrary,
  ])(
    "hash jest niezalezny od tresci regionu",
    (before, innerA, innerB, after) => {
      expect(
        fileHash("f.txt", withRegion(before, innerA, after), testConfig),
      ).toBe(fileHash("f.txt", withRegion(before, innerB, after), testConfig));
    },
  );
});
