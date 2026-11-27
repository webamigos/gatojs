import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import legalPl from "../i18n/pl.json";
import type { CookieCategory } from "../legal-config";
import { resolveServerTree } from "./server-tree";

const { projectConfig } = vi.hoisted(() => ({
  projectConfig: {
    cookieCategories: [] as CookieCategory[],
    consentVersion: 1,
  },
}));

vi.mock("../legal-settings", () => ({
  legalSettings: { config: projectConfig, error: null },
}));
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

import { slots } from "../slots";
import CookieBannerSlot from "../components/cookie-banner-slot";
import LegalLinksSlot from "../components/legal-links-slot";

const messages = { ...coreMessages, legal: legalPl };

const BannerSlot = CookieBannerSlot as unknown as ComponentType<{
  locale: string;
}>;

async function renderSlot() {
  const tree = await resolveServerTree(<BannerSlot locale="pl" />);
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      {tree}
    </NextIntlClientProvider>,
  );
}

describe("legal slots", () => {
  it("contributes the banner to app.root and the links to both footers, for every role", () => {
    expect(
      slots.map(({ slot, id, priority, roles }) => ({
        slot,
        id,
        priority,
        roles,
      })),
    ).toEqual([
      {
        slot: "app.root",
        id: "legal.cookie-banner",
        priority: 1000,
        roles: undefined,
      },
      {
        slot: "auth.footer",
        id: "legal.auth-footer-links",
        priority: 100,
        roles: undefined,
      },
      {
        slot: "app.sidebar.footer",
        id: "legal.sidebar-footer-links",
        priority: 100,
        roles: undefined,
      },
    ]);
  });

  it("no longer contributes to the header actions", () => {
    expect(slots.some((item) => item.slot === "app.header.actions")).toBe(
      false,
    );
  });

  it("the banner contribution loads the cookie banner slot component", async () => {
    const banner = slots.find((item) => item.id === "legal.cookie-banner");
    const loaded = await banner?.component();

    expect(loaded?.default).toBe(CookieBannerSlot);
  });

  it("both footer contributions load the legal links slot component", async () => {
    const auth = slots.find((item) => item.id === "legal.auth-footer-links");
    const sidebar = slots.find(
      (item) => item.id === "legal.sidebar-footer-links",
    );

    expect((await auth?.component())?.default).toBe(LegalLinksSlot);
    expect((await sidebar?.component())?.default).toBe(LegalLinksSlot);
  });
});

describe("CookieBannerSlot", () => {
  beforeEach(() => {
    document.cookie = "cookie_consent=; Max-Age=0; Path=/";
  });

  afterEach(() => {
    projectConfig.cookieCategories = [];
    document.cookie = "cookie_consent=; Max-Age=0; Path=/";
  });

  it("shows the banner when the project declares categories and no choice was made", async () => {
    projectConfig.cookieCategories = ["analytics"];

    await renderSlot();

    expect(
      await screen.findByRole("dialog", { name: "Pliki cookie" }),
    ).toBeInTheDocument();
  });

  it("links the banner to the privacy page", async () => {
    projectConfig.cookieCategories = ["analytics"];

    await renderSlot();
    const dialog = await screen.findByRole("dialog", { name: "Pliki cookie" });

    expect(
      within(dialog).getByRole("link", { name: "Polityka prywatności" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("renders nothing when the project declares no categories", async () => {
    const { container } = await renderSlot();

    expect(container).toBeEmptyDOMElement();
  });
});
