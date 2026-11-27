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
import legalPl from "../../i18n/pl.json";
import legalEn from "../../i18n/en.json";
import { resolveServerTree } from "../../__tests__/server-tree";

const { requestLocale } = vi.hoisted(() => ({
  requestLocale: { value: "pl" },
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
  usePathname: () => "/privacy",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../content", () => ({
  legalDocuments: {
    terms: {
      pl: async () => ({
        default: () => <p>Treść regulaminu po polsku</p>,
        updatedAt: "2026-02-14",
      }),
    },
    privacy: {
      pl: async () => ({
        default: () => <p>Treść polityki po polsku</p>,
        updatedAt: "2026-03-15",
      }),
      en: async () => ({
        default: () => <p>English privacy text</p>,
        updatedAt: "2026-04-16",
      }),
    },
  },
}));

import { LegalDocumentPage } from "../legal-document-page";

async function renderPage(document: "terms" | "privacy", locale: string) {
  const tree = await resolveServerTree(LegalDocumentPage({ document, locale }));
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={messagesByLocale[locale] ?? messagesByLocale.pl}
    >
      {tree}
    </NextIntlClientProvider>,
  );
}

describe("LegalDocumentPage", () => {
  beforeEach(() => {
    requestLocale.value = "pl";
  });

  it("privacy in pl has the page title as its only level 1 heading", async () => {
    await renderPage("privacy", "pl");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Polityka prywatności" }),
    ).toBeInTheDocument();
  });

  it("shows the formatted last update date of the document", async () => {
    await renderPage("privacy", "pl");

    const updated = screen.getByText(/^Ostatnia aktualizacja: /);
    expect(updated.textContent).toContain("2026");
    expect(updated.textContent).toContain("15");
    expect(updated.textContent).not.toContain("{date}");
    expect(updated.textContent).not.toContain("2026-03-15");
  });

  it("shows the last update date in long Polish form", async () => {
    await renderPage("privacy", "pl");

    expect(
      screen.getByText("Ostatnia aktualizacja: 15 marca 2026"),
    ).toBeInTheDocument();
  });

  it("shows the last update date in long English form", async () => {
    await renderPage("privacy", "en");

    expect(
      screen.getByText("Last updated: April 16, 2026"),
    ).toBeInTheDocument();
  });

  it("renders the document content inside an article", async () => {
    await renderPage("privacy", "pl");

    expect(
      within(screen.getByRole("article")).getByText("Treść polityki po polsku"),
    ).toBeInTheDocument();
  });

  it("terms in pl show the terms title and the terms content", async () => {
    await renderPage("terms", "pl");

    expect(
      screen.getByRole("heading", { level: 1, name: "Regulamin" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("article")).getByText(
        "Treść regulaminu po polsku",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Treść polityki po polsku")).toBeNull();
  });

  it("privacy in en shows the English title, date label and content", async () => {
    await renderPage("privacy", "en");

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy policy" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Last updated: /).textContent).toContain("2026");
    expect(screen.getByText("English privacy text")).toBeInTheDocument();
  });

  it("terms in en fall back to the pl content", async () => {
    await renderPage("terms", "en");

    expect(screen.getByText("Treść regulaminu po polsku")).toBeInTheDocument();
  });
});
