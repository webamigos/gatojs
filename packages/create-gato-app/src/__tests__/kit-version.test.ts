import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { highestSemverTag } from "../kit-version.js";

type Triple = [number, number, number];

function isGreater(a: Triple, b: Triple): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

const tripleArbitrary = fc.tuple(
  fc.integer({ min: 0, max: 120 }),
  fc.integer({ min: 0, max: 120 }),
  fc.integer({ min: 0, max: 120 }),
);

describe("highestSemverTag", () => {
  it.each([
    [["v0.1.0", "v0.10.0", "v0.9.1"], "0.10.0"],
    [["v1.0.0", "v0.99.99"], "1.0.0"],
    [["v0.99.99", "v1.0.0"], "1.0.0"],
    [["v1.2.3", "v1.10.0"], "1.10.0"],
    [["v1.10.0", "v1.2.3"], "1.10.0"],
    [["v2.0.1", "v2.0.10"], "2.0.10"],
    [["v2.0.10", "v2.0.1"], "2.0.10"],
    [["v2.0.9", "v2.0.10"], "2.0.10"],
    [["v3.4.5"], "3.4.5"],
  ])("%j gives %s", (tags, expected) => {
    expect(highestSemverTag(tags)).toBe(expected);
  });

  it.each([
    "0.5.0",
    "v1.0",
    "v1.0.0-rc.1",
    "latest",
    "gato-cli@1.0.0",
    "v01.0.0",
    "v1.0.0.1",
  ])("ignores %s", (tag) => {
    expect(highestSemverTag(["v0.0.1", tag])).toBe("0.0.1");
  });

  it("ignores higher prerelease, non-semver and prefixed tags", () => {
    expect(
      highestSemverTag(["v0.1.0", "v9.0.0-rc.1", "latest", "gato-cli@5.0.0"]),
    ).toBe("0.1.0");
  });

  it.each(["xv9.0.0", "gato-cli@v9.0.0"])(
    "ignores a higher tag %s with text before the v",
    (tag) => {
      expect(highestSemverTag(["v0.1.0", tag])).toBe("0.1.0");
    },
  );

  it("ignores a higher tag without the v prefix", () => {
    expect(highestSemverTag(["v0.1.0", "9.0.0"])).toBe("0.1.0");
  });

  it.each([[[]], [["latest"]], [["1.0.0", "v1.0", "v1.0.0-rc.1"]]])(
    "%j gives null",
    (tags) => {
      expect(highestSemverTag(tags)).toBeNull();
    },
  );

  test.prop([fc.array(tripleArbitrary, { minLength: 1, maxLength: 30 })])(
    "returns one of the tags and none is greater",
    (triples) => {
      const result = highestSemverTag(
        triples.map(([major, minor, patch]) => `v${major}.${minor}.${patch}`),
      );
      const candidates = triples.map(
        ([major, minor, patch]) => `${major}.${minor}.${patch}`,
      );
      expect(candidates).toContain(result);
      const winner = triples[candidates.indexOf(result as string)] as Triple;
      for (const triple of triples) {
        expect(isGreater(triple as Triple, winner)).toBe(false);
      }
    },
  );

  test.prop([
    fc.array(tripleArbitrary, { minLength: 1, maxLength: 10 }),
    fc.array(
      fc.constantFrom(
        "latest",
        "v1.0",
        "v999.0.0-rc.1",
        "gato-cli@999.0.0",
        "999.0.0",
        "v0999.0.0",
        "v999.0.0.1",
      ),
      { maxLength: 5 },
    ),
  ])("non-semver tags mixed in are never chosen", (triples, noise) => {
    const tags = triples.map(
      ([major, minor, patch]) => `v${major}.${minor}.${patch}`,
    );
    const result = highestSemverTag([...noise, ...tags, ...noise]);
    const candidates = triples.map(
      ([major, minor, patch]) => `${major}.${minor}.${patch}`,
    );
    expect(candidates).toContain(result);
    const winner = triples[candidates.indexOf(result as string)] as Triple;
    for (const triple of triples) {
      expect(isGreater(triple as Triple, winner)).toBe(false);
    }
  });
});
