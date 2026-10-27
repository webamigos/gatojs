import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { slugifyOrganizationName } from "../organization-slug";

describe("slugifyOrganizationName", () => {
  it("usuwa polskie znaki i dodaje losowy sufiks", () => {
    expect(slugifyOrganizationName("Łódź — Żółć Sp. z o.o.")).toMatch(
      /^lodz-zolc-sp-z-o-o-[a-f0-9]{8}$/,
    );
  });

  it("pusta nazwa → domyślny prefiks", () => {
    expect(slugifyOrganizationName("——")).toMatch(/^organizacja-[a-f0-9]{8}$/);
  });

  it("kolejne wywołania dają różne slugi", () => {
    expect(slugifyOrganizationName("Firma")).not.toBe(
      slugifyOrganizationName("Firma"),
    );
  });

  test.prop([fc.string({ unit: "grapheme", maxLength: 80 })])(
    "dowolna nazwa → slug bezpieczny w URL z 8-znakowym sufiksem hex",
    (name) => {
      expect(slugifyOrganizationName(name)).toMatch(
        /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{8}$/,
      );
    },
  );

  it("bardzo długa nazwa → baza przycięta do 48 znaków", () => {
    expect(slugifyOrganizationName("a".repeat(5000))).toMatch(
      /^a{48}-[a-f0-9]{8}$/,
    );
  });

  it("przycięcie w miejscu myślnika nie zostawia końcowego myślnika", () => {
    const slug = slugifyOrganizationName("abc ".repeat(20));
    expect(slug).toMatch(/^abc(?:-abc)*-[a-f0-9]{8}$/);
    expect(slug.length - 9).toBeLessThanOrEqual(48);
  });

  test.prop([
    fc.string({
      unit: fc.constantFrom("a", "Z", "9", " ", "-", "ł", "—", "."),
      maxLength: 300,
      size: "max",
    }),
  ])(
    "dowolnie długa nazwa → baza najwyżej 48 znaków i slug bezpieczny w URL",
    (name) => {
      const slug = slugifyOrganizationName(name);
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{8}$/);
      expect(slug.length).toBeLessThanOrEqual(48 + 9);
    },
  );

  test.prop([fc.stringMatching(/^[a-z]{49,200}$/)])(
    "nazwa z samych małych liter dłuższa niż 48 → pierwsze 48 znaków jako baza",
    (name) => {
      const slug = slugifyOrganizationName(name);
      expect(slug.slice(0, -9)).toBe(name.slice(0, 48));
      expect(slug.slice(-9)).toMatch(/^-[a-f0-9]{8}$/);
    },
  );

  test.prop([
    fc.array(fc.stringMatching(/^[a-z0-9]{1,6}$/), {
      minLength: 10,
      maxLength: 40,
    }),
  ])(
    "nazwa z wielu słów → baza bez końcowego myślnika i nie dłuższa niż 48",
    (words) => {
      const base = slugifyOrganizationName(words.join(" ")).slice(0, -9);
      expect(base.length).toBeLessThanOrEqual(48);
      expect(base).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    },
  );
});
