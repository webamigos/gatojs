import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { LegalConfig } from "../../legal-config";
import { writeConsent } from "../consent-store";
import { ConsentGate } from "../consent-gate";
import * as publicApi from "../index";

const config: LegalConfig = {
  cookieCategories: ["analytics", "marketing"],
  consentVersion: 2,
};

function clearConsentCookie() {
  document.cookie = "cookie_consent=; Max-Age=0; Path=/";
}

function grantBothCookie() {
  document.cookie = `cookie_consent=${encodeURIComponent('{"v":2,"c":{"analytics":true,"marketing":true},"t":1}')}; Path=/`;
}

describe("ConsentGate", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  afterEach(() => {
    clearConsentCookie();
  });

  it("without consent renders the fallback and not the children", () => {
    render(
      <ConsentGate
        category="analytics"
        config={config}
        fallback={<p>Analityka wyłączona</p>}
      >
        <p>Skrypt analityczny</p>
      </ConsentGate>,
    );

    expect(screen.getByText("Analityka wyłączona")).toBeInTheDocument();
    expect(screen.queryByText("Skrypt analityczny")).toBeNull();
  });

  it("without consent and without a fallback renders nothing", () => {
    const { container } = render(
      <ConsentGate category="analytics" config={config}>
        <p>Skrypt analityczny</p>
      </ConsentGate>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the children after consent is given, without a remount", () => {
    render(
      <ConsentGate
        category="analytics"
        config={config}
        fallback={<p>Analityka wyłączona</p>}
      >
        <p>Skrypt analityczny</p>
      </ConsentGate>,
    );
    expect(screen.getByText("Analityka wyłączona")).toBeInTheDocument();

    act(() => {
      writeConsent({ analytics: true }, config, 1);
    });

    expect(screen.getByText("Skrypt analityczny")).toBeInTheDocument();
    expect(screen.queryByText("Analityka wyłączona")).toBeNull();
  });

  it("hides the children again after consent is withdrawn", () => {
    grantBothCookie();
    render(
      <ConsentGate category="analytics" config={config}>
        <p>Skrypt analityczny</p>
      </ConsentGate>,
    );
    expect(screen.getByText("Skrypt analityczny")).toBeInTheDocument();

    act(() => {
      writeConsent({ analytics: false }, config, 2);
    });

    expect(screen.queryByText("Skrypt analityczny")).toBeNull();
  });

  it("renders the children when a valid cookie grants the category", () => {
    grantBothCookie();

    render(
      <ConsentGate category="marketing" config={config}>
        <p>Piksel reklamowy</p>
      </ConsentGate>,
    );

    expect(screen.getByText("Piksel reklamowy")).toBeInTheDocument();
  });

  it("does not render the children for a category the config does not declare", () => {
    grantBothCookie();

    render(
      <ConsentGate
        category="marketing"
        config={{ cookieCategories: ["analytics"], consentVersion: 2 }}
        fallback={<p>Brak zgody</p>}
      >
        <p>Piksel reklamowy</p>
      </ConsentGate>,
    );

    expect(screen.queryByText("Piksel reklamowy")).toBeNull();
    expect(screen.getByText("Brak zgody")).toBeInTheDocument();
  });

  it("a server render never contains the gated children, even with consent", () => {
    grantBothCookie();

    const html = renderToString(
      <ConsentGate category="analytics" config={config}>
        <p>Skrypt analityczny</p>
      </ConsentGate>,
    );

    expect(html).not.toContain("Skrypt analityczny");
  });
});

describe("public consent API", () => {
  it("exposes hasConsent, onConsentChange, openCookieSettings, useCookieConsent and ConsentGate", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "ConsentGate",
      "hasConsent",
      "onConsentChange",
      "openCookieSettings",
      "useCookieConsent",
    ]);
    expect(publicApi.ConsentGate).toBe(ConsentGate);
  });
});
