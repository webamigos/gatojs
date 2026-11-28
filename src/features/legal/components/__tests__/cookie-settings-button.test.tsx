import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import legalPl from "../../i18n/pl.json";
import type { LegalConfig } from "../../legal-config";
import { onOpenCookieSettings } from "../../consent/consent-store";
import { CookieBanner } from "../cookie-banner";
import { CookieSettingsButton } from "../cookie-settings-button";

vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const messages = { ...coreMessages, legal: legalPl };

const config: LegalConfig = {
  cookieCategories: ["analytics", "marketing"],
  consentVersion: 2,
};

function withIntl(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="pl" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

function clearConsentCookie() {
  document.cookie = "cookie_consent=; Max-Age=0; Path=/";
}

describe("CookieSettingsButton", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  afterEach(() => {
    clearConsentCookie();
  });

  it("with the footer label shows the cookie settings button", async () => {
    render(withIntl(<CookieSettingsButton config={config} label="footer" />));

    expect(
      await screen.findByRole("button", { name: "Ustawienia cookies" }),
    ).toBeInTheDocument();
  });

  it("with the page label shows the change cookie settings button", async () => {
    render(
      withIntl(
        <CookieSettingsButton config={config} label="page" variant="button" />,
      ),
    );

    expect(
      await screen.findByRole("button", { name: "Zmień ustawienia cookies" }),
    ).toBeInTheDocument();
  });

  it("clicking it opens the cookie settings exactly once", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    const unsubscribe = onOpenCookieSettings(listener);
    render(withIntl(<CookieSettingsButton config={config} label="footer" />));

    await user.click(
      await screen.findByRole("button", { name: "Ustawienia cookies" }),
    );
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when the project declares no categories", async () => {
    const { container } = render(
      withIntl(
        <CookieSettingsButton
          config={{ cookieCategories: [], consentVersion: 1 }}
          label="footer"
        />,
      ),
    );
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });

  it("reopens the banner after the visitor already decided", async () => {
    const user = userEvent.setup();
    document.cookie = `cookie_consent=${encodeURIComponent('{"v":2,"c":{"analytics":true,"marketing":true},"t":1}')}; Path=/`;
    render(
      withIntl(
        <>
          <CookieSettingsButton config={config} label="footer" />
          <CookieBanner config={config} />
        </>,
      ),
    );
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(
      await screen.findByRole("button", { name: "Ustawienia cookies" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Pliki cookie" }),
    ).toBeInTheDocument();
  });
});
