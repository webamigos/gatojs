import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import legalPl from "../../i18n/pl.json";
import type { LegalConfig } from "../../legal-config";
import {
  hasConsent,
  openCookieSettings,
  readConsent,
} from "../../consent/consent-store";
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

function withIntl(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="pl" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

function renderBanner(
  props: { config?: LegalConfig; privacyHref?: string } = {},
) {
  return render(withIntl(<CookieBanner config={config} {...props} />));
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

describe("CookieBanner", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  afterEach(() => {
    clearConsentCookie();
  });

  it("renders nothing when the project declares no categories", async () => {
    const { container } = renderBanner({
      config: { cookieCategories: [], consentVersion: 1 },
    });
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays hidden without categories even when settings are opened", async () => {
    renderBanner({ config: { cookieCategories: [], consentVersion: 1 } });
    await act(async () => {});

    act(() => openCookieSettings());

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("without a cookie shows a non-modal dialog with its description and three choices", async () => {
    renderBanner();

    const dialog = await findBanner();

    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toHaveAccessibleDescription(
      /^Używamy niezbędnych plików cookie/,
    );
    expect(
      within(dialog).getByRole("button", { name: "Akceptuj wszystkie" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Odrzuć wszystkie" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Wybierz" }),
    ).toBeInTheDocument();
  });

  it("styles the three first-visit buttons identically", async () => {
    renderBanner();
    const dialog = await findBanner();

    const accept = within(dialog).getByRole("button", {
      name: "Akceptuj wszystkie",
    });
    const reject = within(dialog).getByRole("button", {
      name: "Odrzuć wszystkie",
    });
    const choose = within(dialog).getByRole("button", { name: "Wybierz" });

    expect(reject.className).toBe(accept.className);
    expect(choose.className).toBe(accept.className);
  });

  it("a server render does not contain the banner", () => {
    const html = renderToString(withIntl(<CookieBanner config={config} />));

    expect(html).not.toContain("Pliki cookie");
    expect(html).not.toContain("Akceptuj wszystkie");
  });

  it("reject all closes the banner and stores a decision denying every category", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();

    await user.click(
      within(dialog).getByRole("button", { name: "Odrzuć wszystkie" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasConsent("analytics", config)).toBe(false);
    expect(hasConsent("marketing", config)).toBe(false);
    expect(readConsent(config)).toMatchObject({
      version: 2,
      choices: { analytics: false, marketing: false },
    });
  });

  it("accept all closes the banner and grants every category", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();

    await user.click(
      within(dialog).getByRole("button", { name: "Akceptuj wszystkie" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasConsent("analytics", config)).toBe(true);
    expect(hasConsent("marketing", config)).toBe(true);
  });

  it("choose shows unchecked optional categories, a locked essential row and moves focus to the first checkbox", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();

    await user.click(within(dialog).getByRole("button", { name: "Wybierz" }));

    const analytics = within(dialog).getByRole("checkbox", {
      name: /^Analityczne/,
    });
    const marketing = within(dialog).getByRole("checkbox", {
      name: /^Marketingowe/,
    });
    const essential = within(dialog).getByRole("checkbox", {
      name: /^Niezbędne/,
    });
    expect(analytics).not.toBeChecked();
    expect(analytics).toBeEnabled();
    expect(marketing).not.toBeChecked();
    expect(marketing).toBeEnabled();
    expect(essential).toBeChecked();
    expect(essential).toBeDisabled();
    expect(analytics).toHaveFocus();
    expect(
      within(dialog).getByRole("button", { name: "Zapisz wybór" }),
    ).toBeInTheDocument();
  });

  it("the essential row cannot be unchecked", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();
    await user.click(within(dialog).getByRole("button", { name: "Wybierz" }));
    const essential = within(dialog).getByRole("checkbox", {
      name: /^Niezbędne/,
    });

    await user.click(essential);

    expect(essential).toBeChecked();
  });

  it("saving a chosen category grants only that category", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();
    await user.click(within(dialog).getByRole("button", { name: "Wybierz" }));

    await user.click(
      within(dialog).getByRole("checkbox", { name: /^Marketingowe/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Zapisz wybór" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasConsent("marketing", config)).toBe(true);
    expect(hasConsent("analytics", config)).toBe(false);
  });

  it("saving without checking anything denies every category but records the decision", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();
    await user.click(within(dialog).getByRole("button", { name: "Wybierz" }));

    await user.click(
      within(dialog).getByRole("button", { name: "Zapisz wybór" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readConsent(config)).toMatchObject({
      version: 2,
      choices: { analytics: false, marketing: false },
    });
  });

  it("tab from the page reaches accept, reject and choose in this order", async () => {
    const user = userEvent.setup();
    renderBanner();
    const dialog = await findBanner();

    await user.tab();
    expect(
      within(dialog).getByRole("button", { name: "Akceptuj wszystkie" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      within(dialog).getByRole("button", { name: "Odrzuć wszystkie" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      within(dialog).getByRole("button", { name: "Wybierz" }),
    ).toHaveFocus();
  });

  it("uses no positive tabindex", async () => {
    renderBanner();
    const dialog = await findBanner();

    const positive = Array.from(dialog.querySelectorAll("[tabindex]")).filter(
      (element) => Number(element.getAttribute("tabindex")) > 0,
    );

    expect(positive).toEqual([]);
  });

  it("Enter on a focused button triggers it", async () => {
    const user = userEvent.setup();
    renderBanner();
    await findBanner();

    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasConsent("analytics", config)).toBe(true);
    expect(hasConsent("marketing", config)).toBe(true);
  });

  it("does not take focus when it first appears and returns it after a decision", async () => {
    const user = userEvent.setup();
    render(<button type="button">Before</button>);
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();

    renderBanner();
    const dialog = await findBanner();
    expect(before).toHaveFocus();

    await user.click(
      within(dialog).getByRole("button", { name: "Odrzuć wszystkie" }),
    );

    expect(before).toHaveFocus();
  });

  it("moves focus to the body after a decision when the earlier element is gone", async () => {
    const user = userEvent.setup();
    const page = render(<button type="button">Before</button>);
    screen.getByRole("button", { name: "Before" }).focus();
    renderBanner();
    const dialog = await findBanner();
    page.unmount();

    await user.click(
      within(dialog).getByRole("button", { name: "Akceptuj wszystkie" }),
    );

    expect(document.activeElement).toBe(document.body);
  });

  it("Escape does not dismiss the first-visit banner", async () => {
    const user = userEvent.setup();
    renderBanner();
    await findBanner();

    await user.tab();
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("dialog", { name: "Pliki cookie" }),
    ).toBeInTheDocument();
    expect(readConsent(config)).toBeNull();
  });

  it("a valid cookie of the current version shows no banner", async () => {
    setConsentCookie('{"v":2,"c":{"analytics":true,"marketing":false},"t":1}');

    renderBanner();
    await act(async () => {});

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a cookie of an older version shows the banner again", async () => {
    setConsentCookie('{"v":1,"c":{"analytics":true,"marketing":false},"t":1}');

    renderBanner();

    expect(await findBanner()).toBeInTheDocument();
  });

  it("a cookie missing a newly declared category shows the banner again", async () => {
    setConsentCookie('{"v":2,"c":{"analytics":true},"t":1}');

    renderBanner();

    expect(await findBanner()).toBeInTheDocument();
  });

  it("links to the privacy policy when given its address", async () => {
    renderBanner({ privacyHref: "/privacy" });
    const dialog = await findBanner();

    expect(
      within(dialog).getByRole("link", { name: "Polityka prywatności" }),
    ).toHaveAttribute("href", "/privacy");
  });
});

describe("CookieBanner reopened from cookie settings", () => {
  const storedChoice = '{"v":2,"c":{"analytics":true,"marketing":false},"t":1}';

  beforeEach(() => {
    clearConsentCookie();
    setConsentCookie(storedChoice);
  });

  afterEach(() => {
    clearConsentCookie();
  });

  async function openFromButton() {
    render(<button type="button">Opener</button>);
    const opener = screen.getByRole("button", { name: "Opener" });
    renderBanner();
    await act(async () => {});
    opener.focus();
    act(() => openCookieSettings());
    const dialog = await findBanner();
    return { opener, dialog };
  }

  it("opens in the choose view pre-filled from the stored choice, with a close button", async () => {
    const { dialog } = await openFromButton();

    expect(
      within(dialog).getByRole("checkbox", { name: /^Analityczne/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: /^Marketingowe/ }),
    ).not.toBeChecked();
    expect(
      within(dialog).getByRole("button", { name: "Zamknij" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Zapisz wybór" }),
    ).toBeInTheDocument();
  });

  it("moves focus to the dialog heading", async () => {
    const { dialog } = await openFromButton();

    expect(
      within(dialog).getByRole("heading", { name: "Pliki cookie" }),
    ).toHaveFocus();
  });

  it("Escape closes it, keeps the stored choice and returns focus to the opener", async () => {
    const user = userEvent.setup();
    const { opener } = await openFromButton();
    const cookieBefore = document.cookie;

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.cookie).toBe(cookieBefore);
    expect(opener).toHaveFocus();
  });

  it("the close button closes it and keeps the stored choice", async () => {
    const user = userEvent.setup();
    const { opener, dialog } = await openFromButton();
    const cookieBefore = document.cookie;

    await user.click(within(dialog).getByRole("button", { name: "Zamknij" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.cookie).toBe(cookieBefore);
    expect(opener).toHaveFocus();
  });

  it("unchecking a granted category and saving withdraws it", async () => {
    const user = userEvent.setup();
    const { dialog } = await openFromButton();

    await user.click(
      within(dialog).getByRole("checkbox", { name: /^Analityczne/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Zapisz wybór" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasConsent("analytics", config)).toBe(false);
    expect(hasConsent("marketing", config)).toBe(false);
  });
});
