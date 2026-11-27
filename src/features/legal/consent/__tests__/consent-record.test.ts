import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { LegalConfig } from "../../legal-config";
import {
  allChoices,
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_SECONDS,
  consentCookieString,
  consentCookieValue,
  decide,
  isConsentValid,
  isGranted,
  needsChoice,
  parseConsent,
  serializeConsent,
  type ConsentRecord,
} from "../consent-record";

const SERIALIZED =
  "%7B%22v%22%3A1%2C%22c%22%3A%7B%22analytics%22%3Atrue%7D%2C%22t%22%3A1700000000%7D";

const analyticsAndMarketingV2: LegalConfig = {
  cookieCategories: ["analytics", "marketing"],
  consentVersion: 2,
};

const analyticsOnlyV1: LegalConfig = {
  cookieCategories: ["analytics"],
  consentVersion: 1,
};

const noCategories: LegalConfig = { cookieCategories: [], consentVersion: 1 };

const validV2: ConsentRecord = {
  version: 2,
  choices: { analytics: true, marketing: false },
  decidedAt: 1,
};

describe("consent cookie constants", () => {
  it("the cookie is named cookie_consent", () => {
    expect(CONSENT_COOKIE_NAME).toBe("cookie_consent");
  });

  it("the cookie lives 180 days", () => {
    expect(CONSENT_MAX_AGE_SECONDS).toBe(15552000);
  });
});

describe("serializeConsent and parseConsent", () => {
  it("serializes a record into the URI-encoded short JSON form", () => {
    expect(
      serializeConsent({
        version: 1,
        choices: { analytics: true },
        decidedAt: 1700000000,
      }),
    ).toBe(SERIALIZED);
  });

  it("parses the serialized form back into the record", () => {
    expect(parseConsent(SERIALIZED)).toEqual({
      version: 1,
      choices: { analytics: true },
      decidedAt: 1700000000,
    });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
    ["text that is not JSON", "not-json"],
    ["a truncated encoded object", "%7B"],
    ["a broken percent escape", "%E0%A4%A"],
  ])("returns null for %s", (_label, raw) => {
    expect(parseConsent(raw)).toBeNull();
  });

  it.each([
    ["version 0", '{"v":0,"c":{},"t":1}'],
    ["a negative version", '{"v":-2,"c":{},"t":1}'],
    ["a fractional version", '{"v":1.5,"c":{},"t":1}'],
    ["a version given as a string", '{"v":"1","c":{},"t":1}'],
    ["a missing version", '{"c":{},"t":1}'],
    ["choices as an array", '{"v":1,"c":[],"t":1}'],
    ["choices as null", '{"v":1,"c":null,"t":1}'],
    ["missing choices", '{"v":1,"t":1}'],
    ["a non-boolean choice", '{"v":1,"c":{"analytics":"yes"},"t":1}'],
    ["a numeric choice", '{"v":1,"c":{"marketing":1},"t":1}'],
    ["a decision time given as text", '{"v":1,"c":{},"t":"x"}'],
    ["a missing decision time", '{"v":1,"c":{}}'],
    ["a top-level array", "[1]"],
    ["a top-level null", "null"],
    ["a top-level number", "5"],
  ])("returns null for a record with %s", (_label, json) => {
    expect(parseConsent(encodeURIComponent(json))).toBeNull();
  });

  it("drops unknown category keys and keeps known ones", () => {
    expect(
      parseConsent(
        encodeURIComponent(
          '{"v":2,"c":{"analytics":false,"other":true},"t":5}',
        ),
      ),
    ).toEqual({ version: 2, choices: { analytics: false }, decidedAt: 5 });
  });

  test.prop([fc.string()])("never throws on arbitrary input", (raw) => {
    expect(() => parseConsent(raw)).not.toThrow();
  });

  test.prop([
    fc.record({
      version: fc.integer({ min: 1, max: 1_000_000 }),
      choices: fc.record(
        {
          preferences: fc.boolean(),
          analytics: fc.boolean(),
          marketing: fc.boolean(),
        },
        { requiredKeys: [] },
      ),
      decidedAt: fc.integer({ min: 0, max: 4_000_000_000 }),
    }),
  ])("parse after serialize returns the same record", (record) => {
    expect(parseConsent(serializeConsent(record))).toEqual(record);
  });

  test.prop([
    fc.record({
      version: fc.integer({ min: 1, max: 1_000_000 }),
      choices: fc.record(
        {
          preferences: fc.boolean(),
          analytics: fc.boolean(),
          marketing: fc.boolean(),
        },
        { requiredKeys: [] },
      ),
      decidedAt: fc.integer({ min: 0, max: 4_000_000_000 }),
    }),
    fc.boolean(),
  ])(
    "the written cookie read back from a cookie header gives the same record",
    (record, secure) => {
      const pair = consentCookieString(record, { secure }).split("; ")[0];
      const header = `theme=dark; ${pair}; NEXT_LOCALE=en`;

      expect(parseConsent(consentCookieValue(header))).toEqual(record);
    },
  );
});

describe("consentCookieValue", () => {
  it("finds the consent cookie between other cookies", () => {
    expect(consentCookieValue("a=1; cookie_consent=abc; b=2")).toBe("abc");
  });

  it("finds the consent cookie when it is the only one", () => {
    expect(consentCookieValue("cookie_consent=x")).toBe("x");
  });

  it("ignores a cookie whose name only ends with cookie_consent", () => {
    expect(consentCookieValue("my_cookie_consent=x")).toBeUndefined();
  });

  it("ignores a suffixed name later in the header", () => {
    expect(consentCookieValue("a=1; my_cookie_consent=x")).toBeUndefined();
  });

  it("ignores a cookie whose name only starts with cookie_consent", () => {
    expect(consentCookieValue("cookie_consent_old=x")).toBeUndefined();
  });

  it("ignores cookie_consent appearing only inside another cookie's value", () => {
    expect(consentCookieValue("note=cookie_consent=x")).toBeUndefined();
  });

  it("returns undefined for an empty header", () => {
    expect(consentCookieValue("")).toBeUndefined();
  });
});

describe("consentCookieString", () => {
  const record: ConsentRecord = {
    version: 1,
    choices: { analytics: true },
    decidedAt: 1700000000,
  };

  it("on HTTPS adds Path, Max-Age, SameSite and Secure", () => {
    expect(consentCookieString(record, { secure: true })).toBe(
      `cookie_consent=${SERIALIZED}; Path=/; Max-Age=15552000; SameSite=Lax; Secure`,
    );
  });

  it("without HTTPS leaves Secure out", () => {
    expect(consentCookieString(record, { secure: false })).toBe(
      `cookie_consent=${SERIALIZED}; Path=/; Max-Age=15552000; SameSite=Lax`,
    );
  });
});

describe("isConsentValid and needsChoice", () => {
  it("no record is not valid and needs a choice", () => {
    expect(isConsentValid(null, analyticsAndMarketingV2)).toBe(false);
    expect(needsChoice(null, analyticsAndMarketingV2)).toBe(true);
  });

  it("a record of the current version deciding every category is valid", () => {
    expect(isConsentValid(validV2, analyticsAndMarketingV2)).toBe(true);
    expect(needsChoice(validV2, analyticsAndMarketingV2)).toBe(false);
  });

  it("a record of an older version is not valid", () => {
    const old: ConsentRecord = {
      version: 1,
      choices: { analytics: true, marketing: true },
      decidedAt: 1,
    };

    expect(isConsentValid(old, analyticsAndMarketingV2)).toBe(false);
    expect(needsChoice(old, analyticsAndMarketingV2)).toBe(true);
  });

  it("a record of a newer version is not valid", () => {
    const newer: ConsentRecord = {
      version: 3,
      choices: { analytics: true, marketing: true },
      decidedAt: 1,
    };

    expect(isConsentValid(newer, analyticsAndMarketingV2)).toBe(false);
  });

  it("a record missing a declared category is not valid", () => {
    const partial: ConsentRecord = {
      version: 2,
      choices: { analytics: true },
      decidedAt: 1,
    };

    expect(isConsentValid(partial, analyticsAndMarketingV2)).toBe(false);
    expect(needsChoice(partial, analyticsAndMarketingV2)).toBe(true);
  });

  it("a record missing the first declared category is not valid", () => {
    const partial: ConsentRecord = {
      version: 2,
      choices: { marketing: false },
      decidedAt: 1,
    };

    expect(isConsentValid(partial, analyticsAndMarketingV2)).toBe(false);
  });

  it("a record with a removed category's decision stays valid", () => {
    const withExtra: ConsentRecord = {
      version: 1,
      choices: { analytics: false, marketing: true },
      decidedAt: 1,
    };

    expect(isConsentValid(withExtra, analyticsOnlyV1)).toBe(true);
  });

  it("without declared categories no choice is needed even without a record", () => {
    expect(needsChoice(null, noCategories)).toBe(false);
  });
});

describe("isGranted", () => {
  it("grants a category accepted in a valid record", () => {
    expect(isGranted(validV2, "analytics", analyticsAndMarketingV2)).toBe(true);
  });

  it("denies a category rejected in a valid record", () => {
    expect(isGranted(validV2, "marketing", analyticsAndMarketingV2)).toBe(
      false,
    );
  });

  it("denies everything for a record of an older version", () => {
    const old: ConsentRecord = {
      version: 1,
      choices: { analytics: true, marketing: true },
      decidedAt: 1,
    };

    expect(isGranted(old, "analytics", analyticsAndMarketingV2)).toBe(false);
  });

  it("denies an accepted category when the record leaves another undecided", () => {
    const partial: ConsentRecord = {
      version: 2,
      choices: { analytics: true },
      decidedAt: 1,
    };

    expect(isGranted(partial, "analytics", analyticsAndMarketingV2)).toBe(
      false,
    );
  });

  it("denies everything without a record", () => {
    expect(isGranted(null, "analytics", analyticsAndMarketingV2)).toBe(false);
  });

  it("denies a category the project does not declare even when the record accepts it", () => {
    const record: ConsentRecord = {
      version: 1,
      choices: { analytics: true, marketing: true },
      decidedAt: 1,
    };

    expect(isGranted(record, "marketing", analyticsOnlyV1)).toBe(false);
  });

  it("denies an undeclared category the record does not mention", () => {
    const record: ConsentRecord = {
      version: 1,
      choices: { analytics: true },
      decidedAt: 1,
    };

    expect(isGranted(record, "preferences", analyticsOnlyV1)).toBe(false);
  });
});

describe("decide", () => {
  it("fills undecided declared categories with false", () => {
    expect(
      decide(analyticsAndMarketingV2, { analytics: true }, 1700000000),
    ).toEqual({
      version: 2,
      choices: { analytics: true, marketing: false },
      decidedAt: 1700000000,
    });
  });

  it("drops categories the project does not declare", () => {
    expect(
      decide(analyticsOnlyV1, { analytics: true, marketing: true }, 9),
    ).toEqual({ version: 1, choices: { analytics: true }, decidedAt: 9 });
  });

  it("with no choices denies every declared category", () => {
    expect(decide(analyticsAndMarketingV2, {}, 3)).toEqual({
      version: 2,
      choices: { analytics: false, marketing: false },
      decidedAt: 3,
    });
  });

  it("keeps an explicit false", () => {
    expect(decide(analyticsOnlyV1, { analytics: false }, 4)).toEqual({
      version: 1,
      choices: { analytics: false },
      decidedAt: 4,
    });
  });
});

describe("allChoices", () => {
  it("accepting all sets every declared category to true", () => {
    expect(allChoices(analyticsAndMarketingV2, true)).toEqual({
      analytics: true,
      marketing: true,
    });
  });

  it("rejecting all sets every declared category to false", () => {
    expect(allChoices(analyticsAndMarketingV2, false)).toEqual({
      analytics: false,
      marketing: false,
    });
  });

  it("covers only declared categories", () => {
    expect(allChoices(analyticsOnlyV1, true)).toEqual({ analytics: true });
  });
});
