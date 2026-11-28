import { describe, expect, it } from "vitest";
import { legalConfigSchema } from "../legal-config.schemas";

describe("legalConfigSchema", () => {
  it("fills the default cookie name and lifetime", () => {
    const result = legalConfigSchema.safeParse({
      cookieCategories: [],
      consentVersion: 1,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
    });
  });

  it("keeps the given categories, name and lifetime", () => {
    const result = legalConfigSchema.safeParse({
      cookieCategories: ["analytics", "marketing"],
      consentVersion: 3,
      consentCookieName: "acme_consent",
      consentMaxAgeDays: 30,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      cookieCategories: ["analytics", "marketing"],
      consentVersion: 3,
      consentCookieName: "acme_consent",
      consentMaxAgeDays: 30,
    });
  });

  it.each([
    ["a one-character name", { consentCookieName: "a" }],
    ["a 64-character name", { consentCookieName: "a".repeat(64) }],
    ["a name with a dash and underscore", { consentCookieName: "A-1_b" }],
    ["a lifetime of 1 day", { consentMaxAgeDays: 1 }],
    ["a lifetime of 395 days", { consentMaxAgeDays: 395 }],
  ])("accepts %s", (_label, extra) => {
    expect(
      legalConfigSchema.safeParse({
        cookieCategories: [],
        consentVersion: 1,
        ...extra,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an empty name", { consentCookieName: "" }],
    ["a 65-character name", { consentCookieName: "a".repeat(65) }],
    ["a name with a space", { consentCookieName: "a b" }],
    ["a name with a semicolon", { consentCookieName: "a;b" }],
    ["a name with a non-ASCII letter", { consentCookieName: "ä" }],
    ["a lifetime of 0 days", { consentMaxAgeDays: 0 }],
    ["a lifetime of 396 days", { consentMaxAgeDays: 396 }],
    ["a fractional lifetime", { consentMaxAgeDays: 1.5 }],
    ["a negative lifetime", { consentMaxAgeDays: -1 }],
    ["consent version 0", { consentVersion: 0 }],
    ["a fractional consent version", { consentVersion: 1.5 }],
    ["an unknown category", { cookieCategories: ["tracking"] }],
    ["a duplicate category", { cookieCategories: ["analytics", "analytics"] }],
  ])("rejects %s", (_label, extra) => {
    expect(
      legalConfigSchema.safeParse({
        cookieCategories: [],
        consentVersion: 1,
        ...extra,
      }).success,
    ).toBe(false);
  });
});

describe("legalConfigSchema reserved cookie names", () => {
  it.each([
    "NEXT_LOCALE",
    "next_locale",
    "Next_Locale",
    "better-auth",
    "better-auth-session_token",
    "Better-Auth_consent",
    "__Host-consent",
    "__HOST-consent",
    "__Secure-consent",
    "__secure-consent",
  ])(
    "rejects %s with the reserved name message on consentCookieName",
    (name) => {
      const result = legalConfigSchema.safeParse({
        cookieCategories: [],
        consentVersion: 1,
        consentCookieName: name,
      });

      expect(result.success).toBe(false);
      expect(
        result.error?.issues.map(({ path, message }) => ({ path, message })),
      ).toEqual([
        {
          path: ["consentCookieName"],
          message:
            "consentCookieName must not be NEXT_LOCALE, a better-auth cookie or use the __Host- or __Secure- prefix",
        },
      ]);
    },
  );

  it.each([
    "cookie_consent",
    "acme_consent",
    "_consent",
    "host_consent",
    "secure_consent",
    "my-better-auth",
    "consent__Host-",
    "NEXT_LOCALE_consent",
  ])("accepts %s", (name) => {
    const result = legalConfigSchema.safeParse({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: name,
    });

    expect(result.success).toBe(true);
    expect(result.data?.consentCookieName).toBe(name);
  });
});
