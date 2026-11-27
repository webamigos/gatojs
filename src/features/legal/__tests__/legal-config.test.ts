import { describe, expect, it } from "vitest";
import {
  COOKIE_CATEGORIES,
  defineLegalConfig,
  LegalConfigError,
  type CookieCategory,
  type LegalConfig,
} from "../legal-config";

function thrownBy(input: LegalConfig): unknown {
  try {
    defineLegalConfig(input);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("defineLegalConfig", () => {
  it("accepts a config without cookie categories", () => {
    expect(
      defineLegalConfig({ cookieCategories: [], consentVersion: 1 }),
    ).toEqual({ cookieCategories: [], consentVersion: 1 });
  });

  it("accepts declared categories and a higher version", () => {
    expect(
      defineLegalConfig({
        cookieCategories: ["analytics", "marketing"],
        consentVersion: 3,
      }),
    ).toEqual({
      cookieCategories: ["analytics", "marketing"],
      consentVersion: 3,
    });
  });

  it("accepts all three categories at once", () => {
    expect(
      defineLegalConfig({
        cookieCategories: ["preferences", "analytics", "marketing"],
        consentVersion: 1,
      }),
    ).toEqual({
      cookieCategories: ["preferences", "analytics", "marketing"],
      consentVersion: 1,
    });
  });

  it("rejects a duplicate category with LegalConfigError naming it", () => {
    const error = thrownBy({
      cookieCategories: ["analytics", "analytics"],
      consentVersion: 1,
    });

    expect(error).toBeInstanceOf(LegalConfigError);
    expect((error as Error).message).toContain(
      "duplicate cookie category: analytics",
    );
  });

  it("rejects a duplicate that is not adjacent", () => {
    const error = thrownBy({
      cookieCategories: ["marketing", "analytics", "marketing"],
      consentVersion: 1,
    });

    expect(error).toBeInstanceOf(LegalConfigError);
    expect((error as Error).message).toContain(
      "duplicate cookie category: marketing",
    );
  });

  it("rejects an unknown category with LegalConfigError naming it", () => {
    const error = thrownBy({
      cookieCategories: ["tracking" as CookieCategory],
      consentVersion: 1,
    });

    expect(error).toBeInstanceOf(LegalConfigError);
    expect((error as Error).message).toContain(
      "unknown cookie category: tracking",
    );
  });

  it("rejects an unknown category listed after a known one", () => {
    const error = thrownBy({
      cookieCategories: ["analytics", "tracking" as CookieCategory],
      consentVersion: 1,
    });

    expect(error).toBeInstanceOf(LegalConfigError);
    expect((error as Error).message).toContain(
      "unknown cookie category: tracking",
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects consentVersion %s as not a positive integer",
    (consentVersion) => {
      const error = thrownBy({ cookieCategories: [], consentVersion });

      expect(error).toBeInstanceOf(LegalConfigError);
      expect((error as Error).message).toContain(
        "consentVersion must be a positive integer",
      );
    },
  );

  it("the thrown error carries the name LegalConfigError", () => {
    const error = thrownBy({ cookieCategories: [], consentVersion: 0 });

    expect((error as Error).name).toBe("LegalConfigError");
  });
});

describe("COOKIE_CATEGORIES", () => {
  it("is the fixed category set from the spec", () => {
    expect(COOKIE_CATEGORIES).toEqual([
      "preferences",
      "analytics",
      "marketing",
    ]);
  });
});
