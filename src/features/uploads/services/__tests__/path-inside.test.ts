// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { isPathInside } from "../path-inside";

const plainSegment = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 12 }),
    fc.string({ unit: "grapheme", minLength: 1, maxLength: 6 }),
    fc.string({
      unit: fc.constantFrom(".", "a", "ł", " ", "-"),
      minLength: 1,
      maxLength: 5,
    }),
  )
  .filter(
    (segment) =>
      segment !== "." &&
      segment !== ".." &&
      !["/", "\\", "\0"].some((forbidden) => segment.includes(forbidden)),
  );

const absoluteDirectory = fc
  .tuple(fc.array(plainSegment, { maxLength: 4 }), fc.boolean())
  .map(([segments, trailingSeparator]) => {
    const directory = path.join("/", ...segments);
    return trailingSeparator ? path.join(directory, "/") : directory;
  });

describe("isPathInside", () => {
  it("ścieżka równa katalogowi leży w nim", () => {
    expect(isPathInside("/data", "/data")).toBe(true);
  });

  it("ścieżka zagnieżdżona głębiej leży w katalogu", () => {
    expect(isPathInside("/data", "/data/a/b")).toBe(true);
  });

  it("ukośnik na końcu katalogu nie zmienia wyniku", () => {
    expect(isPathInside("/data/", "/data/a")).toBe(true);
  });

  it("plik o nazwie zaczynającej się od dwóch kropek leży w katalogu", () => {
    expect(isPathInside("/data", "/data/..foo")).toBe(true);
  });

  it("ścieżka pod katalogiem głównym leży w nim", () => {
    expect(isPathInside("/", "/x")).toBe(true);
  });

  it("katalog, którego nazwa tylko zaczyna się tak samo, nie leży w katalogu", () => {
    expect(isPathInside("/data", "/database")).toBe(false);
  });

  it("katalog nadrzędny nie leży w katalogu", () => {
    expect(isPathInside("/data", "/")).toBe(false);
  });

  it("ścieżka wychodząca z katalogu przez .. nie leży w nim", () => {
    expect(isPathInside("/data", "/data/../etc")).toBe(false);
  });

  it("ścieżki względne porównuje po rozwiązaniu od katalogu roboczego", () => {
    expect(isPathInside("volumes", "./volumes/uploads")).toBe(true);
    expect(isPathInside("volumes/uploads", "volumes")).toBe(false);
  });

  test.prop([
    absoluteDirectory,
    fc.array(plainSegment, { minLength: 1, maxLength: 5 }),
  ])(
    "katalog z dołączonymi zwykłymi segmentami leży w tym katalogu",
    (parent, segments) => {
      expect(isPathInside(parent, path.join(parent, ...segments))).toBe(true);
    },
  );

  test.prop([absoluteDirectory, plainSegment])(
    "katalog nie leży we własnym podkatalogu",
    (parent, segment) => {
      expect(isPathInside(path.join(parent, segment), parent)).toBe(false);
    },
  );

  test.prop([absoluteDirectory, plainSegment, plainSegment])(
    "katalog o nazwie przedłużonej o dowolny ciąg nie leży w katalogu o krótszej nazwie",
    (parent, name, suffix) => {
      expect(
        isPathInside(
          path.join(parent, name),
          path.join(parent, `${name}${suffix}`),
        ),
      ).toBe(false);
    },
  );
});
