import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareCodePoint, compareModuleNames } from "../compare.js";

describe("compareCodePoint", () => {
  it("mniejszy napis daje -1", () => {
    expect(compareCodePoint("a", "b")).toBe(-1);
  });

  it("większy napis daje 1", () => {
    expect(compareCodePoint("b", "a")).toBe(1);
  });

  it("równe napisy dają 0", () => {
    expect(compareCodePoint("a", "a")).toBe(0);
  });

  it("wielka litera idzie przed małą (punkty kodowe, nie locale)", () => {
    expect(compareCodePoint("Z", "a")).toBe(-1);
    expect(compareCodePoint("a", "Z")).toBe(1);
  });

  it("prefiks jest mniejszy od dłuższego napisu", () => {
    expect(compareCodePoint("ab", "abc")).toBe(-1);
    expect(compareCodePoint("abc", "ab")).toBe(1);
  });
});

describe("compareModuleNames", () => {
  it("core idzie przed innym modulem niezaleznie od kolejnosci wejscia", () => {
    expect(["alpha", "core"].sort(compareModuleNames)).toEqual([
      "core",
      "alpha",
    ]);
    expect(["core", "alpha"].sort(compareModuleNames)).toEqual([
      "core",
      "alpha",
    ]);
  });

  it("pozostale moduly rosnaco po punktach kodowych", () => {
    expect(["needs-demo", "core", "demo"].sort(compareModuleNames)).toEqual([
      "core",
      "demo",
      "needs-demo",
    ]);
  });

  it("core z core daje 0", () => {
    expect(compareModuleNames("core", "core")).toBe(0);
  });

  test.prop([
    fc.uniqueArray(fc.stringMatching(/^[a-z][a-z-]*$/), { maxLength: 12 }),
  ])("core zawsze pierwszy, reszta rosnaco", (names) => {
    const sorted = [...names.filter((n) => n !== "core"), "core"].sort(
      compareModuleNames,
    );
    expect(sorted[0]).toBe("core");
    const rest = sorted.slice(1);
    for (let i = 1; i < rest.length; i++) {
      expect(rest[i - 1]! < rest[i]!).toBe(true);
    }
  });
});
