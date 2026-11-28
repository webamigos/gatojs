import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import corePl from "@/app/messages/pl.json";
import legalPl from "@/features/legal/i18n/pl.json";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { resolveServerTree } from "@/features/legal/__tests__/server-tree";

const { installedModules, settings } = vi.hoisted(() => ({
  installedModules: [] as ModuleDef[],
  settings: {
    config: {
      cookieCategories: ["analytics"],
      consentVersion: 1,
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
    },
    error: null as Error | null,
  },
}));

const messages = { ...corePl, legal: legalPl };

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (scope?: { namespace?: string }) =>
    createTranslator({
      locale: "pl",
      messages,
      namespace: scope?.namespace,
    } as Parameters<typeof createTranslator>[0]),
  ),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
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
vi.mock("@/modules.client.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.client.generated")>()),
  clientModules: installedModules,
}));
vi.mock("@/features/legal/legal-settings", () => ({
  legalSettings: settings,
}));

import { getTranslations } from "next-intl/server";
import LegalLayout from "../layout";

const legalModule: ModuleDef = {
  key: "legal",
  nav: [],
  routePrefixes: ["/terms", "/privacy"],
  public: true,
};

const dashboardModule: ModuleDef = {
  key: "dashboard",
  nav: [],
  routePrefixes: ["/dashboard"],
};

function installModules(modules: ModuleDef[]) {
  installedModules.splice(0, installedModules.length, ...modules);
}

function layout() {
  return LegalLayout({
    children: <p>Treść strony prawnej</p>,
    params: Promise.resolve({ locale: "pl" }),
  });
}

beforeEach(() => {
  vi.mocked(getTranslations).mockClear();
});

describe("legal layout with the module disabled", () => {
  beforeEach(() => {
    installModules([dashboardModule]);
  });

  it("rejects with not found", async () => {
    await expect(resolveServerTree(layout())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("reads no translations before answering not found", async () => {
    await resolveServerTree(layout()).catch(() => undefined);

    expect(getTranslations).not.toHaveBeenCalled();
  });
});

describe("legal layout with the module enabled", () => {
  beforeEach(() => {
    installModules([dashboardModule, legalModule]);
  });

  it("renders the page inside main and the legal footer links", async () => {
    const tree = await resolveServerTree(layout());
    render(
      <NextIntlClientProvider locale="pl" messages={messages}>
        {tree}
      </NextIntlClientProvider>,
    );

    expect(
      within(screen.getByRole("main")).getByText("Treść strony prawnej"),
    ).toBeInTheDocument();
    const footer = screen.getByRole("navigation", {
      name: "Informacje prawne",
    });
    expect(
      within(footer).getByRole("link", { name: "Regulamin" }),
    ).toHaveAttribute("href", "/terms");
    expect(
      within(footer).getByRole("link", { name: "Prywatność" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      within(footer).getByRole("button", { name: "Ustawienia cookies" }),
    ).toBeInTheDocument();
  });
});

describe("legal layout with an invalid legal config", () => {
  const configError = new Error(
    "Invalid src/features/legal/legal.config.ts: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395",
  );

  beforeEach(() => {
    installModules([legalModule]);
    settings.error = configError;
  });

  afterEach(() => {
    settings.error = null;
  });

  it("rejects with the config error", async () => {
    await expect(resolveServerTree(layout())).rejects.toBe(configError);
  });
});
