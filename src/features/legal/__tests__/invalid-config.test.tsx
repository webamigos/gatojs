import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import legalPl from "../i18n/pl.json";
import { resolveServerTree } from "./server-tree";

const { logger } = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({ logger }));
vi.mock("../legal.config", () => ({
  legalConfig: {
    cookieCategories: ["analytics"],
    consentVersion: 1,
    consentMaxAgeDays: 0,
  },
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

import CookieBannerSlot from "../components/cookie-banner-slot";
import { LegalLinks } from "../components/legal-links";
import { CookieSettingsButton } from "../components/cookie-settings-button";
import { hasConsent } from "../consent";
import { legalSettings } from "../legal-settings";

const messages = { ...coreMessages, legal: legalPl };

const BannerSlot = CookieBannerSlot as unknown as ComponentType<{
  locale: string;
}>;

const ANALYTICS_GRANTED_V1 =
  "cookie_consent=%7B%22v%22%3A1%2C%22c%22%3A%7B%22analytics%22%3Atrue%7D%2C%22t%22%3A1764244800%7D; Path=/";

async function renderWithIntl(node: ReactNode) {
  const tree = await resolveServerTree(node);
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      {tree}
    </NextIntlClientProvider>,
  );
}

describe("legal module with an invalid project config", () => {
  beforeEach(() => {
    logger.error.mockClear();
    document.cookie = "cookie_consent=; Max-Age=0; Path=/";
  });

  afterEach(() => {
    document.cookie = "cookie_consent=; Max-Age=0; Path=/";
  });

  it("legalSettings carries the file error and the fail-closed config", () => {
    expect(legalSettings.config).toEqual({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
    });
    expect(legalSettings.error?.message).toBe(
      "Invalid src/features/legal/legal.config.ts: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395",
    );
  });

  it("the banner slot renders nothing although the invalid config declares a category", async () => {
    const { container } = await renderWithIntl(<BannerSlot locale="pl" />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the banner slot logs the config error once as Invalid legal config", async () => {
    await renderWithIntl(<BannerSlot locale="pl" />);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Invalid legal config", {
      error: expect.objectContaining({
        name: "LegalConfigError",
        message:
          "Invalid src/features/legal/legal.config.ts: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395",
      }),
    });
  });

  it("the footer links show no cookie settings button", async () => {
    await renderWithIntl(<LegalLinks />);

    expect(
      screen.getByRole("navigation", { name: "Informacje prawne" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("the page cookie settings button renders nothing", async () => {
    const { container } = await renderWithIntl(
      <CookieSettingsButton label="page" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("hasConsent stays false even with a stored grant for a category of the invalid config", () => {
    document.cookie = ANALYTICS_GRANTED_V1;

    expect(document.cookie).toContain("cookie_consent=");
    expect(hasConsent("analytics")).toBe(false);
  });
});
