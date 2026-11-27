import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  createFormatter,
  createTranslator,
  NextIntlClientProvider,
} from "next-intl";
import corePl from "@/app/messages/pl.json";
import coreEn from "@/app/messages/en.json";
import legalPl from "@/features/legal/i18n/pl.json";
import legalEn from "@/features/legal/i18n/en.json";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { resolveServerTree } from "@/features/legal/__tests__/server-tree";

const { installedModules, termsLoader, privacyLoader, requestLocale } =
  vi.hoisted(() => ({
    requestLocale: { value: "pl" },
    installedModules: [] as ModuleDef[],
    termsLoader: { calls: 0 },
    privacyLoader: { calls: 0 },
  }));

const messagesByLocale: Record<string, Record<string, unknown>> = {
  pl: { ...corePl, legal: legalPl },
  en: { ...coreEn, legal: legalEn },
};

type Scope = string | { locale?: string; namespace?: string } | undefined;

function localeOf(scope: Scope | { locale?: string }) {
  return (typeof scope === "object" && scope?.locale) || requestLocale.value;
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (scope?: Scope) =>
    createTranslator({
      locale: localeOf(scope),
      messages: messagesByLocale[localeOf(scope)],
      namespace: typeof scope === "string" ? scope : scope?.namespace,
    } as Parameters<typeof createTranslator>[0]),
  ),
  getFormatter: vi.fn(async (options?: { locale?: string }) =>
    createFormatter({ locale: localeOf(options), timeZone: "Europe/Warsaw" }),
  ),
  getLocale: vi.fn(async () => requestLocale.value),
  getNow: vi.fn(async () => new Date("2026-11-27T12:00:00Z")),
  getTimeZone: vi.fn(async () => "Europe/Warsaw"),
  setRequestLocale: vi.fn((locale: string) => {
    requestLocale.value = locale;
  }),
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
vi.mock("@/features/legal/content", () => ({
  legalDocuments: {
    terms: {
      pl: async () => {
        termsLoader.calls += 1;
        return {
          default: () => <p>Treść regulaminu</p>,
          updatedAt: "2026-02-14",
        };
      },
    },
    privacy: {
      pl: async () => {
        privacyLoader.calls += 1;
        return {
          default: () => <p>Treść polityki prywatności</p>,
          updatedAt: "2026-03-15",
        };
      },
    },
  },
}));

import TermsPage, { generateMetadata as termsMetadata } from "../terms/page";
import PrivacyPage, {
  generateMetadata as privacyMetadata,
} from "../privacy/page";

const legalModule: ModuleDef = {
  key: "legal",
  nav: [],
  routePrefixes: ["/terms", "/privacy"],
  public: true,
};

function installModules(modules: ModuleDef[]) {
  requestLocale.value = "pl";
  installedModules.splice(0, installedModules.length, ...modules);
}

function params(locale = "pl") {
  return Promise.resolve({ locale });
}

async function renderPage(node: Promise<ReactNode>) {
  const tree = await resolveServerTree(node);
  return render(
    <NextIntlClientProvider locale="pl" messages={messagesByLocale.pl}>
      {tree}
    </NextIntlClientProvider>,
  );
}

describe("legal pages with the module disabled", () => {
  beforeEach(() => {
    installModules([
      { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    ]);
    termsLoader.calls = 0;
    privacyLoader.calls = 0;
  });

  it("the terms page is not found", async () => {
    await expect(
      resolveServerTree(TermsPage({ params: params() })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(termsLoader.calls).toBe(0);
  });

  it("the privacy page is not found", async () => {
    await expect(
      resolveServerTree(PrivacyPage({ params: params() })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(privacyLoader.calls).toBe(0);
  });
});

describe("legal pages with the module enabled", () => {
  beforeEach(() => {
    installModules([
      { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
      legalModule,
    ]);
  });

  it("the terms page renders the terms document", async () => {
    await renderPage(TermsPage({ params: params() }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Regulamin" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("article")).getByText("Treść regulaminu"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Treść polityki prywatności")).toBeNull();
  });

  it("the privacy page renders the privacy document", async () => {
    await renderPage(PrivacyPage({ params: params() }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Polityka prywatności" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("article")).getByText(
        "Treść polityki prywatności",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Treść regulaminu")).toBeNull();
  });

  it("the terms page title comes from the module translations", async () => {
    await expect(
      termsMetadata({ params: params("pl") }),
    ).resolves.toMatchObject({
      title: "Regulamin",
    });
    await expect(
      termsMetadata({ params: params("en") }),
    ).resolves.toMatchObject({
      title: "Terms of service",
    });
  });

  it("the privacy page title comes from the module translations", async () => {
    await expect(
      privacyMetadata({ params: params("pl") }),
    ).resolves.toMatchObject({
      title: "Polityka prywatności",
    });
    await expect(
      privacyMetadata({ params: params("en") }),
    ).resolves.toMatchObject({
      title: "Privacy policy",
    });
  });
});
