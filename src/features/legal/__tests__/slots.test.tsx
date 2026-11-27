import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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

vi.mock("../legal.config", () => ({ legalConfig: projectConfig }));
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

const messages = { ...coreMessages, legal: legalPl };

async function renderSlot() {
  const tree = await resolveServerTree(
    <CookieBannerSlot organizationId="org-1" />,
  );
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      {tree}
    </NextIntlClientProvider>,
  );
}

describe("legal slots", () => {
  it("contributes one cookie banner to the header actions for every role", () => {
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      slot: "app.header.actions",
      id: "legal.cookie-banner",
      priority: 1000,
    });
    expect(slots[0].roles).toBeUndefined();
  });

  it("the contribution loads the cookie banner slot component", async () => {
    const loaded = await slots[0].component();

    expect(loaded.default).toBe(CookieBannerSlot);
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

  it("renders nothing when the project declares no categories", async () => {
    const { container } = await renderSlot();

    expect(container).toBeEmptyDOMElement();
  });
});
