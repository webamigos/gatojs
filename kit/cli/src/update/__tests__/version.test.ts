import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion } from "../version.js";

const numberPart = fc.nat({ max: 1000 });
const versionArbitrary = fc
  .tuple(numberPart, numberPart, numberPart)
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);
const prereleaseArbitrary = fc.constantFrom(
  "rc.1",
  "alpha",
  "beta.2",
  "0",
  "x-y",
  "-",
  "a1",
  "1a",
  "rc.-",
);

describe("parseVersion", () => {
  it.each(["0.2.0", "1.10.3-rc.1", "0.0.0", "10.20.30", "1.0.0-alpha.beta"])(
    "%s jest zwracana bez zmian",
    (value) => {
      expect(parseVersion(value)).toBe(value);
    },
  );

  it.each([
    "v0.2.0",
    "V0.2.0",
    "0.2",
    "",
    "0.2.0.1",
    "01.2.0",
    "0.02.0",
    "0.2.00",
    "1.2.3-",
    " 0.2.0",
    "0.2.0 ",
    "a.b.c",
  ])("%j zgłasza Nieprawidłowa wersja z przykładem", (value) => {
    expect(() => parseVersion(value)).toThrow(
      `Nieprawidłowa wersja: ${value}; podaj na przykład 0.2.0`,
    );
  });

  it("komunikat dla v0.2.0 jest dokładny", () => {
    expect(() => parseVersion("v0.2.0")).toThrow(
      new Error("Nieprawidłowa wersja: v0.2.0; podaj na przykład 0.2.0"),
    );
  });
});

describe("compareVersions", () => {
  it("0.10.0 jest nowsza od 0.9.0 (liczbowo, nie leksykalnie)", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.9.0", "0.10.0")).toBeLessThan(0);
  });

  it("10.0.0 jest nowsza od 9.0.0, a 0.0.10 od 0.0.9", () => {
    expect(compareVersions("10.0.0", "9.0.0")).toBeGreaterThan(0);
    expect(compareVersions("0.0.10", "0.0.9")).toBeGreaterThan(0);
  });

  it("równe wersje dają 0", () => {
    expect(compareVersions("1.0.0", "1.0.0") === 0).toBe(true);
    expect(compareVersions("1.0.0-rc.1", "1.0.0-rc.1") === 0).toBe(true);
  });

  it("prerelease jest starszy od wersji bez sufiksu", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
  });

  it("prerelease wyższej wersji jest nowszy od niższej wersji bez sufiksu", () => {
    expect(compareVersions("1.1.0-rc.1", "1.0.0")).toBeGreaterThan(0);
  });

  it("0.1.0 jest starsza od 0.2.0", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
  });

  it("major wygrywa z minor i patch", () => {
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.1.99")).toBeGreaterThan(0);
  });

  it("identyfikatory liczbowe prerelease porównywane liczbowo", () => {
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0-rc.10", "1.0.0-rc.2")).toBeGreaterThan(0);
  });

  it("identyfikatory tekstowe prerelease porównywane leksykalnie", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
  });

  it("identyfikator liczbowy jest niższy od tekstowego", () => {
    expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
  });

  it("identyfikator z cyframi i literami jest tekstowy", () => {
    expect(compareVersions("1.0.0-a1", "1.0.0-2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-1a", "1.0.0-2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-2", "1.0.0-a1")).toBeLessThan(0);
    expect(compareVersions("1.0.0-2", "1.0.0-1a")).toBeLessThan(0);
  });

  it("liczbowy jest niższy od tekstowego, także gdy tekstowy jest leksykalnie mniejszy", () => {
    expect(compareVersions("1.0.0-10", "1.0.0--")).toBeLessThan(0);
    expect(compareVersions("1.0.0--", "1.0.0-10")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-1", "1.0.0--")).toBeLessThan(0);
  });

  it("beta jest nowsza od alpha", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBeGreaterThan(0);
  });

  it("myślnik w prerelease nie jest separatorem identyfikatorów", () => {
    expect(compareVersions("1.0.0-x-y", "1.0.0-xy")).toBeLessThan(0);
  });

  it("dłuższy prerelease ze wspólnym początkiem jest nowszy", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
  });

  test.prop([versionArbitrary, versionArbitrary])(
    "zamiana argumentów odwraca znak wyniku",
    (a, b) => {
      expect(
        Math.sign(compareVersions(a, b)) === -Math.sign(compareVersions(b, a)),
      ).toBe(true);
    },
  );

  test.prop([versionArbitrary])("wersja porównana ze sobą daje 0", (a) => {
    expect(compareVersions(a, a) === 0).toBe(true);
  });

  test.prop([numberPart, numberPart])(
    "kolejność major odpowiada kolejności liczb",
    (a, b) => {
      expect(
        Math.sign(compareVersions(`${a}.0.0`, `${b}.0.0`)) === Math.sign(a - b),
      ).toBe(true);
    },
  );

  test.prop([versionArbitrary, prereleaseArbitrary])(
    "prerelease jest zawsze starszy od tej samej wersji bez sufiksu",
    (version, prerelease) => {
      expect(compareVersions(`${version}-${prerelease}`, version)).toBeLessThan(
        0,
      );
    },
  );
});
