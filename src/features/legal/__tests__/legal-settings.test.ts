import { afterEach, describe, expect, it, vi } from "vitest";

async function settingsFor(legalConfig: unknown) {
  vi.resetModules();
  vi.doMock("../legal.config", () => ({ legalConfig }));
  const { legalSettings } = await import("../legal-settings");
  const { LegalConfigError: FreshLegalConfigError } =
    await import("../legal-config");
  return { legalSettings, FreshLegalConfigError };
}

afterEach(() => {
  vi.doUnmock("../legal.config");
  vi.resetModules();
});

describe("legalSettings", () => {
  it("resolves the project config with defaults and no error", async () => {
    const { legalSettings } = await settingsFor({
      cookieCategories: ["analytics"],
      consentVersion: 2,
    });

    expect(legalSettings).toEqual({
      config: {
        cookieCategories: ["analytics"],
        consentVersion: 2,
        consentCookieName: "cookie_consent",
        consentMaxAgeDays: 180,
      },
      error: null,
    });
  });

  it("resolves the plain seed shape without categories", async () => {
    const { legalSettings } = await settingsFor({
      cookieCategories: [],
      consentVersion: 1,
    });

    expect(legalSettings).toEqual({
      config: {
        cookieCategories: [],
        consentVersion: 1,
        consentCookieName: "cookie_consent",
        consentMaxAgeDays: 180,
      },
      error: null,
    });
  });

  it("fails closed with the file error when the project config is invalid", async () => {
    const { legalSettings, FreshLegalConfigError } = await settingsFor({
      cookieCategories: ["analytics", "marketing"],
      consentVersion: 1,
      consentMaxAgeDays: 0,
    });

    expect(legalSettings.config).toEqual({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
    });
    expect(legalSettings.error).toBeInstanceOf(FreshLegalConfigError);
    expect(legalSettings.error?.message).toBe(
      "Invalid src/features/legal/legal.config.ts: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395",
    );
  });

  it("importing an invalid project config does not throw", async () => {
    await expect(
      settingsFor({ cookieCategories: "analytics", consentVersion: 1 }),
    ).resolves.toBeDefined();
  });

  it("an invalid config error keeps the LegalConfigError name", async () => {
    const { legalSettings } = await settingsFor({
      cookieCategories: [],
      consentVersion: 0,
    });

    expect(legalSettings.error?.name).toBe("LegalConfigError");
  });
});
