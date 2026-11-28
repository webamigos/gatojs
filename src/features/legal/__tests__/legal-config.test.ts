import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import {
  COOKIE_CATEGORIES,
  defineLegalConfig,
  LEGAL_CONFIG_FILE,
  LegalConfigError,
  resolveLegalConfig,
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
    ).toEqual({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
    });
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
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
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
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
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

describe("defineLegalConfig consent cookie settings", () => {
  it("keeps a custom cookie name and lifetime", () => {
    expect(
      defineLegalConfig({
        cookieCategories: [],
        consentVersion: 1,
        consentCookieName: "acme_consent",
        consentMaxAgeDays: 30,
      }),
    ).toEqual({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: "acme_consent",
      consentMaxAgeDays: 30,
    });
  });

  it.each(["a", "A-1_b", "a".repeat(64)])(
    "accepts the cookie name %s",
    (consentCookieName) => {
      expect(
        defineLegalConfig({
          cookieCategories: [],
          consentVersion: 1,
          consentCookieName,
        }).consentCookieName,
      ).toBe(consentCookieName);
    },
  );

  it.each(["", "a b", "a;b", "ä", "a=b", "a".repeat(65)])(
    "rejects the cookie name %j",
    (consentCookieName) => {
      const error = thrownBy({
        cookieCategories: [],
        consentVersion: 1,
        consentCookieName,
      });

      expect(error).toBeInstanceOf(LegalConfigError);
      expect((error as Error).message).toContain(
        "consentCookieName must be 1-64 letters, digits, _ or -",
      );
    },
  );

  it.each([1, 395])("accepts a lifetime of %i days", (consentMaxAgeDays) => {
    expect(
      defineLegalConfig({
        cookieCategories: [],
        consentVersion: 1,
        consentMaxAgeDays,
      }).consentMaxAgeDays,
    ).toBe(consentMaxAgeDays);
  });

  it.each([0, 396, 1.5, -1])(
    "rejects a lifetime of %s days",
    (consentMaxAgeDays) => {
      const error = thrownBy({
        cookieCategories: [],
        consentVersion: 1,
        consentMaxAgeDays,
      });

      expect(error).toBeInstanceOf(LegalConfigError);
      expect((error as Error).message).toContain(
        "consentMaxAgeDays must be an integer from 1 to 395",
      );
    },
  );

  it("a cookie problem keeps the LegalConfigError name", () => {
    const error = thrownBy({
      cookieCategories: [],
      consentVersion: 1,
      consentMaxAgeDays: 0,
    });

    expect((error as Error).name).toBe("LegalConfigError");
  });
});

describe("defineLegalConfig problem messages", () => {
  it("names the field of a lifetime problem in the exact message", () => {
    const error = thrownBy({
      cookieCategories: [],
      consentVersion: 1,
      consentMaxAgeDays: 0,
    });

    expect((error as Error).message).toBe(
      "Invalid legal config: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395",
    );
  });

  it("names the index of a duplicate category in the exact message", () => {
    const error = thrownBy({
      cookieCategories: ["analytics", "analytics"],
      consentVersion: 1,
    });

    expect((error as Error).message).toBe(
      "Invalid legal config: cookieCategories.1: duplicate cookie category: analytics",
    );
  });

  it("joins problems of several fields with a semicolon", () => {
    const error = thrownBy({
      cookieCategories: ["tracking" as CookieCategory],
      consentVersion: 0,
    });

    expect((error as Error).message).toBe(
      "Invalid legal config: cookieCategories.0: unknown cookie category: tracking; consentVersion: consentVersion must be a positive integer",
    );
  });

  it.each([
    "NEXT_LOCALE",
    "next_locale",
    "better-auth",
    "better-auth-consent",
    "BETTER-AUTH_consent",
    "__Host-consent",
    "__host-consent",
    "__Secure-consent",
    "__SECURE-consent",
  ])("rejects the reserved cookie name %s naming the field", (name) => {
    const error = thrownBy({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: name,
    });

    expect(error).toBeInstanceOf(LegalConfigError);
    expect((error as Error).message).toBe(
      "Invalid legal config: consentCookieName: consentCookieName must not be NEXT_LOCALE, a better-auth cookie or use the __Host- or __Secure- prefix",
    );
  });

  it.each([
    "cookie_consent",
    "acme_consent",
    "_consent",
    "host_consent",
    "my-better-auth",
    "consent__Secure-",
    "NEXT_LOCALE_consent",
  ])("accepts the cookie name %s", (name) => {
    expect(
      defineLegalConfig({
        cookieCategories: [],
        consentVersion: 1,
        consentCookieName: name,
      }).consentCookieName,
    ).toBe(name);
  });
});

const FAIL_CLOSED = {
  cookieCategories: [],
  consentVersion: 1,
  consentCookieName: "cookie_consent",
  consentMaxAgeDays: 180,
};

describe("LEGAL_CONFIG_FILE", () => {
  it("is the project path of the legal config seed", () => {
    expect(LEGAL_CONFIG_FILE).toBe("src/features/legal/legal.config.ts");
  });
});

describe("resolveLegalConfig", () => {
  it("parses a valid config with defaults and no error", () => {
    expect(
      resolveLegalConfig({
        cookieCategories: ["analytics"],
        consentVersion: 2,
      }),
    ).toEqual({
      config: {
        cookieCategories: ["analytics"],
        consentVersion: 2,
        consentCookieName: "cookie_consent",
        consentMaxAgeDays: 180,
      },
      error: null,
    });
  });

  it("keeps a valid custom cookie name and lifetime", () => {
    expect(
      resolveLegalConfig({
        cookieCategories: ["preferences", "marketing"],
        consentVersion: 4,
        consentCookieName: "acme_consent",
        consentMaxAgeDays: 30,
      }),
    ).toEqual({
      config: {
        cookieCategories: ["preferences", "marketing"],
        consentVersion: 4,
        consentCookieName: "acme_consent",
        consentMaxAgeDays: 30,
      },
      error: null,
    });
  });

  it("fails closed on an invalid lifetime with the exact file and field message", () => {
    const result = resolveLegalConfig({
      cookieCategories: ["analytics"],
      consentVersion: 1,
      consentMaxAgeDays: 0,
    });

    expect(result.config).toEqual(FAIL_CLOSED);
    expect(result.error).toBeInstanceOf(LegalConfigError);
    expect(result.error?.name).toBe("LegalConfigError");
    expect(result.error?.message).toBe(
      "Invalid src/features/legal/legal.config.ts: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395",
    );
  });

  it("does not throw on an invalid config", () => {
    expect(() =>
      resolveLegalConfig({
        cookieCategories: ["analytics"],
        consentVersion: 0,
      }),
    ).not.toThrow();
  });

  it("fails closed on null with a root problem", () => {
    const result = resolveLegalConfig(null);

    expect(result.config).toEqual(FAIL_CLOSED);
    expect(result.error).toBeInstanceOf(LegalConfigError);
    expect(
      result.error?.message.startsWith(
        "Invalid src/features/legal/legal.config.ts: (root): ",
      ),
    ).toBe(true);
  });

  it("names the index of a duplicate category and drops the declared categories", () => {
    const result = resolveLegalConfig({
      cookieCategories: ["analytics", "analytics"],
      consentVersion: 1,
    });

    expect(result.config).toEqual(FAIL_CLOSED);
    expect(result.error?.message).toContain(
      "cookieCategories.1: duplicate cookie category: analytics",
    );
  });

  it("names cookieCategories when it is not an array", () => {
    const result = resolveLegalConfig({
      cookieCategories: "analytics",
      consentVersion: 1,
    });

    expect(result.config).toEqual(FAIL_CLOSED);
    expect(
      result.error?.message.startsWith(
        "Invalid src/features/legal/legal.config.ts: cookieCategories: ",
      ),
    ).toBe(true);
  });

  it("drops valid categories, version and cookie settings when another field is invalid", () => {
    const result = resolveLegalConfig({
      cookieCategories: ["analytics", "marketing"],
      consentVersion: 3,
      consentCookieName: "acme_consent",
      consentMaxAgeDays: 396,
    });

    expect(result.config).toEqual(FAIL_CLOSED);
    expect(result.error?.message).toBe(
      "Invalid src/features/legal/legal.config.ts: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395",
    );
  });

  it("joins problems of several fields with a semicolon", () => {
    expect(
      resolveLegalConfig({ cookieCategories: ["tracking"], consentVersion: 0 })
        .error?.message,
    ).toBe(
      "Invalid src/features/legal/legal.config.ts: cookieCategories.0: unknown cookie category: tracking; consentVersion: consentVersion must be a positive integer",
    );
  });

  it("rejects a reserved cookie name naming the field", () => {
    const result = resolveLegalConfig({
      cookieCategories: ["analytics"],
      consentVersion: 1,
      consentCookieName: "NEXT_LOCALE",
    });

    expect(result.config).toEqual(FAIL_CLOSED);
    expect(result.error?.message).toBe(
      "Invalid src/features/legal/legal.config.ts: consentCookieName: consentCookieName must not be NEXT_LOCALE, a better-auth cookie or use the __Host- or __Secure- prefix",
    );
  });

  test.prop([fc.anything()])(
    "any input either resolves without error or fails closed with a file message",
    (input) => {
      const result = resolveLegalConfig(input);

      if (result.error === null) {
        expect(result.config.consentVersion).toBeGreaterThanOrEqual(1);
      } else {
        expect(result.config).toEqual(FAIL_CLOSED);
        expect(result.error.message).toMatch(
          /^Invalid src\/features\/legal\/legal\.config\.ts: \S/,
        );
      }
    },
  );

  test.prop([
    fc.subarray(["preferences", "analytics", "marketing"] as const),
    fc.integer({ min: 1, max: 1000 }),
    fc.integer({ min: 1, max: 395 }),
  ])(
    "a valid config resolves to itself with no error",
    (cookieCategories, consentVersion, consentMaxAgeDays) => {
      expect(
        resolveLegalConfig({
          cookieCategories,
          consentVersion,
          consentMaxAgeDays,
        }),
      ).toEqual({
        config: {
          cookieCategories,
          consentVersion,
          consentCookieName: "cookie_consent",
          consentMaxAgeDays,
        },
        error: null,
      });
    },
  );
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
