import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegalConfig } from "../../legal-config";
import {
  consentSnapshot,
  hasConsent,
  onConsentChange,
  onOpenCookieSettings,
  openCookieSettings,
  readConsent,
  subscribeConsent,
  writeConsent,
} from "../consent-store";

const config: LegalConfig = {
  cookieCategories: ["analytics", "marketing"],
  consentVersion: 2,
};

const WRITTEN_VALUE =
  "%7B%22v%22%3A2%2C%22c%22%3A%7B%22analytics%22%3Atrue%2C%22marketing%22%3Afalse%7D%2C%22t%22%3A1700000000%7D";

function clearConsentCookie() {
  document.cookie = "cookie_consent=; Max-Age=0; Path=/";
}

function setConsentCookie(json: string) {
  document.cookie = `cookie_consent=${encodeURIComponent(json)}; Path=/`;
}

function useUrl(url: string) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

describe("consent store", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useUrl("http://localhost:3000/");
    clearConsentCookie();
  });

  it("without a cookie there is no record and no consent", () => {
    expect(readConsent(config)).toBeNull();
    expect(hasConsent("analytics", config)).toBe(false);
  });

  it("writeConsent returns the full record and stores it in the cookie", () => {
    const record = writeConsent({ analytics: true }, config, 1700000000);

    expect(record).toEqual({
      version: 2,
      choices: { analytics: true, marketing: false },
      decidedAt: 1700000000,
    });
    expect(document.cookie).toContain(`cookie_consent=${WRITTEN_VALUE}`);
  });

  it("after writeConsent the accepted category is granted and the other denied", () => {
    writeConsent({ analytics: true }, config, 1700000000);

    expect(hasConsent("analytics", config)).toBe(true);
    expect(hasConsent("marketing", config)).toBe(false);
  });

  it("readConsent returns the record written before", () => {
    writeConsent({ marketing: true }, config, 42);

    expect(readConsent(config)).toEqual({
      version: 2,
      choices: { analytics: false, marketing: true },
      decidedAt: 42,
    });
  });

  it("writeConsent without a time stamps the current time in epoch seconds", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000999);

    expect(writeConsent({}, config).decidedAt).toBe(1700000000);
  });

  it("on http the written cookie string has no Secure attribute", () => {
    const setter = vi.spyOn(document, "cookie", "set");

    writeConsent({ analytics: true }, config, 1700000000);

    expect(setter.mock.calls.at(-1)?.[0]).toBe(
      `cookie_consent=${WRITTEN_VALUE}; Path=/; Max-Age=15552000; SameSite=Lax`,
    );
  });

  it("on https the written cookie string ends with Secure", () => {
    useUrl("https://localhost:3000/");
    const setter = vi.spyOn(document, "cookie", "set");

    writeConsent({ analytics: true }, config, 1700000000);

    expect(setter.mock.calls.at(-1)?.[0]).toBe(
      `cookie_consent=${WRITTEN_VALUE}; Path=/; Max-Age=15552000; SameSite=Lax; Secure`,
    );
  });

  it("a cookie of an older consent version grants nothing", () => {
    setConsentCookie('{"v":1,"c":{"analytics":true,"marketing":true},"t":1}');

    expect(hasConsent("analytics", config)).toBe(false);
  });

  it("a cookie missing a declared category grants nothing", () => {
    setConsentCookie('{"v":2,"c":{"analytics":true},"t":1}');

    expect(hasConsent("analytics", config)).toBe(false);
  });

  it("a cookie granting a category the config does not declare grants nothing", () => {
    setConsentCookie('{"v":2,"c":{"analytics":true,"marketing":true},"t":1}');

    expect(
      hasConsent("marketing", {
        cookieCategories: ["analytics"],
        consentVersion: 2,
      }),
    ).toBe(false);
  });

  it("a garbage cookie reads as no record", () => {
    document.cookie = "cookie_consent=garbage; Path=/";

    expect(readConsent(config)).toBeNull();
    expect(hasConsent("analytics", config)).toBe(false);
  });

  it("onConsentChange gets the new record once per write", () => {
    const listener = vi.fn();
    const unsubscribe = onConsentChange(listener);

    writeConsent({ analytics: true }, config, 1700000000);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      version: 2,
      choices: { analytics: true, marketing: false },
      decidedAt: 1700000000,
    });
  });

  it("an unsubscribed consent listener is not called again", () => {
    const listener = vi.fn();
    const unsubscribe = onConsentChange(listener);
    unsubscribe();

    writeConsent({ analytics: true }, config, 1);

    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribing one consent listener keeps the others", () => {
    const kept = vi.fn();
    const removed = vi.fn();
    const unsubscribeKept = onConsentChange(kept);
    const unsubscribeRemoved = onConsentChange(removed);
    unsubscribeRemoved();

    writeConsent({ analytics: true }, config, 1);
    unsubscribeKept();

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it("subscribeConsent listeners are notified after a write and not after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);

    writeConsent({ analytics: true }, config, 1);
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();
    writeConsent({ analytics: false }, config, 2);

    expect(listener).not.toHaveBeenCalled();
  });

  it("openCookieSettings calls every settings listener once", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = onOpenCookieSettings(first);
    const unsubscribeSecond = onOpenCookieSettings(second);

    openCookieSettings();
    unsubscribeFirst();
    unsubscribeSecond();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("an unsubscribed settings listener is not called", () => {
    const listener = vi.fn();
    const unsubscribe = onOpenCookieSettings(listener);
    unsubscribe();

    openCookieSettings();

    expect(listener).not.toHaveBeenCalled();
  });

  it("consentSnapshot is the identical object while the cookie is unchanged", () => {
    writeConsent({ analytics: true }, config, 1);

    const first = consentSnapshot(config);
    const second = consentSnapshot(config);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it("consentSnapshot changes after a write", () => {
    writeConsent({ analytics: true }, config, 1);
    const before = consentSnapshot(config);

    writeConsent({ analytics: false }, config, 2);
    const after = consentSnapshot(config);

    expect(after).not.toBe(before);
    expect(after).toEqual({
      version: 2,
      choices: { analytics: false, marketing: false },
      decidedAt: 2,
    });
  });

  it("consentSnapshot follows a cookie set outside the store", () => {
    setConsentCookie('{"v":2,"c":{"analytics":true,"marketing":true},"t":7}');

    expect(consentSnapshot(config)).toEqual({
      version: 2,
      choices: { analytics: true, marketing: true },
      decidedAt: 7,
    });
  });

  it("without a document writeConsent returns the record and notifies listeners", () => {
    const listener = vi.fn();
    const unsubscribe = onConsentChange(listener);
    vi.stubGlobal("document", undefined);

    const record = writeConsent({ analytics: true }, config, 1);
    unsubscribe();

    const expected = {
      version: 2,
      choices: { analytics: true, marketing: false },
      decidedAt: 1,
    };
    expect(record).toEqual(expected);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expected);
  });

  it("without a document there is no record and no consent", () => {
    setConsentCookie('{"v":2,"c":{"analytics":true,"marketing":true},"t":1}');
    vi.stubGlobal("document", undefined);

    expect(readConsent(config)).toBeNull();
    expect(hasConsent("analytics", config)).toBe(false);
  });

  it("consentSnapshot is null without a cookie", () => {
    writeConsent({ analytics: true }, config, 1);
    clearConsentCookie();

    expect(consentSnapshot(config)).toBeNull();
  });
});

describe("consent store with a custom cookie name and lifetime", () => {
  const acmeConfig: LegalConfig = {
    cookieCategories: ["analytics"],
    consentVersion: 1,
    consentCookieName: "acme",
    consentMaxAgeDays: 30,
  };

  const defaultNameConfig: LegalConfig = {
    cookieCategories: ["analytics"],
    consentVersion: 1,
  };

  const ACME_VALUE =
    "%7B%22v%22%3A1%2C%22c%22%3A%7B%22analytics%22%3Atrue%7D%2C%22t%22%3A1%7D";

  function clearAll() {
    document.cookie = "acme=; Max-Age=0; Path=/";
    clearConsentCookie();
  }

  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearAll();
  });

  it("writes the cookie under the configured name with the configured lifetime in seconds", () => {
    const setter = vi.spyOn(document, "cookie", "set");

    writeConsent({ analytics: true }, acmeConfig, 1);

    expect(setter.mock.calls.at(-1)?.[0]).toBe(
      `acme=${ACME_VALUE}; Path=/; Max-Age=2592000; SameSite=Lax`,
    );
  });

  it("a lifetime of one day is 86400 seconds", () => {
    const setter = vi.spyOn(document, "cookie", "set");

    writeConsent(
      { analytics: true },
      { ...acmeConfig, consentMaxAgeDays: 1 },
      1,
    );

    expect(setter.mock.calls.at(-1)?.[0]).toContain("; Max-Age=86400;");
  });

  it("without a configured name and lifetime writes cookie_consent for 180 days", () => {
    const setter = vi.spyOn(document, "cookie", "set");

    writeConsent({ analytics: true }, defaultNameConfig, 1);

    expect(setter.mock.calls.at(-1)?.[0]).toBe(
      `cookie_consent=${ACME_VALUE}; Path=/; Max-Age=15552000; SameSite=Lax`,
    );
  });

  it("after writing under the configured name the category is granted", () => {
    writeConsent({ analytics: true }, acmeConfig, 1);

    expect(hasConsent("analytics", acmeConfig)).toBe(true);
    expect(document.cookie).not.toContain("cookie_consent=");
  });

  it("a valid cookie_consent cookie is ignored under another name", () => {
    setConsentCookie('{"v":1,"c":{"analytics":true},"t":1}');

    expect(hasConsent("analytics", acmeConfig)).toBe(false);
    expect(hasConsent("analytics", defaultNameConfig)).toBe(true);
  });

  it("reads the configured cookie even when cookie_consent holds garbage", () => {
    document.cookie = "cookie_consent=garbage; Path=/";
    document.cookie = `acme=${ACME_VALUE}; Path=/`;

    expect(hasConsent("analytics", acmeConfig)).toBe(true);
  });

  it("consentSnapshot is keyed by the cookie name", () => {
    setConsentCookie('{"v":1,"c":{"analytics":false},"t":2}');
    document.cookie = `acme=${ACME_VALUE}; Path=/`;

    expect(consentSnapshot(defaultNameConfig)).toEqual({
      version: 1,
      choices: { analytics: false },
      decidedAt: 2,
    });
    expect(consentSnapshot(acmeConfig)).toEqual({
      version: 1,
      choices: { analytics: true },
      decidedAt: 1,
    });
    expect(consentSnapshot(defaultNameConfig)).toEqual({
      version: 1,
      choices: { analytics: false },
      decidedAt: 2,
    });
  });

  it("consentSnapshot for a custom name is stable while its cookie is unchanged", () => {
    document.cookie = `acme=${ACME_VALUE}; Path=/`;

    const first = consentSnapshot(acmeConfig);

    expect(first).not.toBeNull();
    expect(consentSnapshot(acmeConfig)).toBe(first);
  });
});
