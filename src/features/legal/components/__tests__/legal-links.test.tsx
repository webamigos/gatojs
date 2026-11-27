import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import legalPl from "../../i18n/pl.json";
import type { CookieCategory, LegalConfig } from "../../legal-config";
import { onOpenCookieSettings } from "../../consent/consent-store";

const { projectConfig } = vi.hoisted(() => ({
  projectConfig: {
    cookieCategories: [] as CookieCategory[],
    consentVersion: 1,
  },
}));

vi.mock("../../legal.config", () => ({ legalConfig: projectConfig }));
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

import { LegalLinks } from "../legal-links";
import LegalLinksSlot from "../legal-links-slot";

const messages = { ...coreMessages, legal: legalPl };

const withCategories: LegalConfig = {
  cookieCategories: ["analytics"],
  consentVersion: 1,
};

const withoutCategories: LegalConfig = {
  cookieCategories: [],
  consentVersion: 1,
};

function withIntl(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="pl" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

function legalNav() {
  return screen.findByRole("navigation", { name: "Informacje prawne" });
}

describe("LegalLinks", () => {
  afterEach(() => {
    projectConfig.cookieCategories = [];
  });

  it("links to the terms and the privacy policy", async () => {
    render(withIntl(<LegalLinks config={withoutCategories} />));
    const nav = await legalNav();

    expect(
      within(nav).getByRole("link", { name: "Regulamin" }),
    ).toHaveAttribute("href", "/terms");
    expect(
      within(nav).getByRole("link", { name: "Prywatność" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("shows no cookie settings button without declared categories", async () => {
    render(withIntl(<LegalLinks config={withoutCategories} />));
    const nav = await legalNav();
    await act(async () => {});

    expect(within(nav).queryByRole("button")).toBeNull();
    expect(within(nav).queryByText("Ustawienia cookies")).toBeNull();
  });

  it("with declared categories shows the cookie settings button", async () => {
    render(withIntl(<LegalLinks config={withCategories} />));
    const nav = await legalNav();

    expect(
      await within(nav).findByRole("button", { name: "Ustawienia cookies" }),
    ).toBeInTheDocument();
  });

  it("the cookie settings button opens the settings once", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    const unsubscribe = onOpenCookieSettings(listener);
    render(withIntl(<LegalLinks config={withCategories} />));
    const nav = await legalNav();

    await user.click(
      await within(nav).findByRole("button", { name: "Ustawienia cookies" }),
    );
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("passes the class name to the navigation", async () => {
    render(
      withIntl(<LegalLinks config={withoutCategories} className="mt-4" />),
    );

    expect(await legalNav()).toHaveClass("mt-4");
  });
});

describe("LegalLinksSlot", () => {
  afterEach(() => {
    projectConfig.cookieCategories = [];
  });

  it("renders the legal links with the project config", async () => {
    projectConfig.cookieCategories = ["analytics"];
    render(withIntl(<LegalLinksSlot />));
    const nav = await legalNav();

    expect(
      within(nav).getByRole("link", { name: "Regulamin" }),
    ).toHaveAttribute("href", "/terms");
    expect(
      await within(nav).findByRole("button", { name: "Ustawienia cookies" }),
    ).toBeInTheDocument();
  });

  it("without declared categories renders only the two links", async () => {
    render(withIntl(<LegalLinksSlot />));
    const nav = await legalNav();
    await act(async () => {});

    expect(within(nav).getAllByRole("link")).toHaveLength(2);
    expect(within(nav).queryByRole("button")).toBeNull();
  });
});
