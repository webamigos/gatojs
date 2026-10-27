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
});
