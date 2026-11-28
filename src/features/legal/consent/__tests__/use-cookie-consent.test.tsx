import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { LegalConfig } from "../../legal-config";
import { hasConsent, onOpenCookieSettings } from "../consent-store";
import { useCookieConsent } from "../use-cookie-consent";

const config: LegalConfig = {
  cookieCategories: ["analytics", "marketing"],
  consentVersion: 2,
};

function clearConsentCookie() {
  document.cookie = "cookie_consent=; Max-Age=0; Path=/";
}

function ReadyProbe() {
  const { ready } = useCookieConsent(config);
  return <span>{String(ready)}</span>;
}

function NeedsChoiceProbe() {
  const { needsChoice } = useCookieConsent(config);
  return <span>{String(needsChoice)}</span>;
}

describe("useCookieConsent", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  afterEach(() => {
    clearConsentCookie();
  });

  it("after mount without a cookie it is ready, needs a choice and has no choices", () => {
    const { result } = renderHook(() => useCookieConsent(config));

    expect(result.current.ready).toBe(true);
    expect(result.current.needsChoice).toBe(true);
    expect(result.current.choices).toEqual({});
    expect(result.current.categories).toEqual(["analytics", "marketing"]);
    expect(result.current.hasConsent("analytics")).toBe(false);
  });

  it("acceptAll grants every declared category", () => {
    const { result } = renderHook(() => useCookieConsent(config));

    act(() => result.current.acceptAll());

    expect(result.current.needsChoice).toBe(false);
    expect(result.current.choices).toEqual({
      analytics: true,
      marketing: true,
    });
    expect(result.current.hasConsent("analytics")).toBe(true);
    expect(result.current.hasConsent("marketing")).toBe(true);
    expect(hasConsent("marketing", config)).toBe(true);
  });

  it("rejectAll denies every declared category and records the decision", () => {
    const { result } = renderHook(() => useCookieConsent(config));

    act(() => result.current.rejectAll());

    expect(result.current.needsChoice).toBe(false);
    expect(result.current.choices).toEqual({
      analytics: false,
      marketing: false,
    });
    expect(result.current.hasConsent("analytics")).toBe(false);
    expect(result.current.hasConsent("marketing")).toBe(false);
  });

  it("rejectAll after acceptAll withdraws every category", () => {
    const { result } = renderHook(() => useCookieConsent(config));

    act(() => result.current.acceptAll());
    act(() => result.current.rejectAll());

    expect(result.current.choices).toEqual({
      analytics: false,
      marketing: false,
    });
    expect(hasConsent("analytics", config)).toBe(false);
  });

  it("save stores the given choices and denies the rest", () => {
    const { result } = renderHook(() => useCookieConsent(config));

    act(() => result.current.save({ marketing: true }));

    expect(result.current.needsChoice).toBe(false);
    expect(result.current.choices).toEqual({
      analytics: false,
      marketing: true,
    });
    expect(result.current.hasConsent("marketing")).toBe(true);
    expect(result.current.hasConsent("analytics")).toBe(false);
  });

  it("a cookie of an older version leaves no choices and needs a choice", () => {
    document.cookie = `cookie_consent=${encodeURIComponent('{"v":1,"c":{"analytics":true,"marketing":true},"t":1}')}; Path=/`;

    const { result } = renderHook(() => useCookieConsent(config));

    expect(result.current.needsChoice).toBe(true);
    expect(result.current.choices).toEqual({});
    expect(result.current.hasConsent("analytics")).toBe(false);
  });

  it("without declared categories no choice is needed", () => {
    const { result } = renderHook(() =>
      useCookieConsent({ cookieCategories: [], consentVersion: 1 }),
    );

    expect(result.current.ready).toBe(true);
    expect(result.current.needsChoice).toBe(false);
    expect(result.current.categories).toEqual([]);
  });

  it("a decision in one consumer updates every other consumer", () => {
    const first = renderHook(() => useCookieConsent(config));
    const second = renderHook(() => useCookieConsent(config));

    act(() => first.result.current.acceptAll());

    expect(second.result.current.choices).toEqual({
      analytics: true,
      marketing: true,
    });
    expect(second.result.current.needsChoice).toBe(false);
  });

  it("openSettings notifies the cookie settings listeners", () => {
    const listener = vi.fn();
    const unsubscribe = onOpenCookieSettings(listener);
    const { result } = renderHook(() => useCookieConsent(config));

    act(() => result.current.openSettings());
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is not ready during a server render", () => {
    expect(renderToString(<ReadyProbe />)).toBe("<span>false</span>");
  });

  it("does not ask for a choice during a server render", () => {
    expect(renderToString(<NeedsChoiceProbe />)).toBe("<span>false</span>");
  });
});
