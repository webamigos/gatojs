import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import legalPl from "../../i18n/pl.json";
import type { LegalConfig } from "../../legal-config";
import { openCookieSettings } from "../../consent/consent-store";
import { CookieBanner } from "../cookie-banner";

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const messages = { ...coreMessages, legal: legalPl };

const config: LegalConfig = {
  cookieCategories: ["analytics", "marketing"],
  consentVersion: 2,
};

const storedChoice = '{"v":2,"c":{"analytics":true,"marketing":false},"t":1}';

function withIntl(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="pl" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

function renderBanner(bannerConfig: LegalConfig = config) {
  return render(withIntl(<CookieBanner config={bannerConfig} />));
}

function renderPageButton(name: string) {
  render(<button type="button">{name}</button>);
  return screen.getByRole("button", { name });
}

function clearConsentCookie() {
  document.cookie = "cookie_consent=; Max-Age=0; Path=/";
}

function setConsentCookie(json: string) {
  document.cookie = `cookie_consent=${encodeURIComponent(json)}; Path=/`;
}

function findBanner() {
  return screen.findByRole("dialog", { name: "Pliki cookie" });
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

describe("CookieBanner focus on first visit", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  afterEach(() => {
    clearConsentCookie();
  });

  it("after hydration returns focus to the element focused before the banner appeared", async () => {
    const user = userEvent.setup();
    const before = renderPageButton("Before");
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      withIntl(<CookieBanner config={config} />),
    );
    document.body.appendChild(container);
    before.focus();
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, withIntl(<CookieBanner config={config} />));
    });
    const dialog = await findBanner();
    expect(before).toHaveFocus();

    await user.click(
      within(dialog).getByRole("button", { name: "Odrzuć wszystkie" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(before).toHaveFocus();
    act(() => root?.unmount());
    container.remove();
  });

  it("toggling a checkbox in the choose view keeps focus on it", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();
    await user.click(within(dialog).getByRole("button", { name: "Wybierz" }));
    const marketing = within(dialog).getByRole("checkbox", {
      name: /^Marketingowe/,
    });

    await user.click(marketing);

    expect(marketing).toBeChecked();
    expect(marketing).toHaveFocus();
  });

  it("Escape on the first-visit banner keeps focus on the focused button", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();
    const accept = within(dialog).getByRole("button", {
      name: "Akceptuj wszystkie",
    });
    accept.focus();

    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("dialog", { name: "Pliki cookie" }),
    ).toBeInTheDocument();
    expect(accept).toHaveFocus();
  });

  it("each category checkbox is described by its category description", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();

    await user.click(within(dialog).getByRole("button", { name: "Wybierz" }));

    expect(
      within(dialog).getByRole("checkbox", { name: /^Analityczne/ }),
    ).toHaveAccessibleDescription(
      "Pomagają nam zrozumieć, jak korzystasz z aplikacji.",
    );
    expect(
      within(dialog).getByRole("checkbox", { name: /^Marketingowe/ }),
    ).toHaveAccessibleDescription("Służą do mierzenia i dopasowania reklam.");
    expect(
      within(dialog).getByRole("checkbox", { name: /^Niezbędne/ }),
    ).toHaveAccessibleDescription(
      "Logowanie, język i zapis tej decyzji. Zawsze włączone.",
    );
  });
});

describe("CookieBanner focus with a stored choice", () => {
  beforeEach(() => {
    clearConsentCookie();
    setConsentCookie(storedChoice);
  });

  afterEach(() => {
    clearConsentCookie();
  });

  async function openSettingsFrom(opener: HTMLElement | null) {
    renderBanner();
    await act(async () => {});
    if (opener) {
      opener.focus();
    } else {
      blurActiveElement();
    }
    act(() => openCookieSettings());
    return findBanner();
  }

  it("Escape without a banner leaves a focused page button focused", async () => {
    const user = userEvent.setup();
    const pageButton = renderPageButton("Strona");
    renderBanner();
    await act(async () => {});
    pageButton.focus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pageButton).toHaveFocus();
  });

  it("toggling a checkbox in the settings view keeps focus on it", async () => {
    const user = userEvent.setup();
    const dialog = await openSettingsFrom(renderPageButton("Opener"));
    const marketing = within(dialog).getByRole("checkbox", {
      name: /^Marketingowe/,
    });

    await user.click(marketing);

    expect(marketing).toBeChecked();
    expect(marketing).toHaveFocus();
  });

  it("a key other than Escape does not close the settings view", async () => {
    const user = userEvent.setup();
    await openSettingsFrom(renderPageButton("Opener"));

    await user.keyboard("a");

    expect(
      screen.getByRole("dialog", { name: "Pliki cookie" }),
    ).toBeInTheDocument();
  });

  it("after closing the settings Escape no longer moves focus", async () => {
    const user = userEvent.setup();
    const opener = renderPageButton("Opener");
    const other = renderPageButton("Inny");
    const dialog = await openSettingsFrom(opener);
    await user.click(within(dialog).getByRole("button", { name: "Zamknij" }));
    other.focus();

    await user.keyboard("{Escape}");

    expect(other).toHaveFocus();
  });

  it("opened with nothing focused, Escape returns focus to the body", async () => {
    const user = userEvent.setup();
    const outside = renderPageButton("Poza");
    await openSettingsFrom(null);
    outside.focus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("the settings view follows a config changed after mount", async () => {
    const { rerender } = renderBanner({
      cookieCategories: ["analytics"],
      consentVersion: 2,
    });
    await act(async () => {});
    rerender(withIntl(<CookieBanner config={config} />));

    act(() => openCookieSettings());
    const dialog = await findBanner();

    expect(
      within(dialog).getByRole("checkbox", { name: /^Analityczne/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: /^Marketingowe/ }),
    ).not.toBeChecked();
  });

  it("the settings view judges the stored choice by the config of the latest render", async () => {
    setConsentCookie('{"v":2,"c":{"analytics":true},"t":1}');
    const { rerender } = renderBanner({
      cookieCategories: ["analytics"],
      consentVersion: 1,
    });
    expect(await findBanner()).toBeInTheDocument();

    rerender(
      withIntl(
        <CookieBanner
          config={{ cookieCategories: ["analytics"], consentVersion: 2 }}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => openCookieSettings());
    const dialog = await findBanner();

    expect(
      within(dialog).getByRole("checkbox", { name: /^Analityczne/ }),
    ).toBeChecked();
  });
});
