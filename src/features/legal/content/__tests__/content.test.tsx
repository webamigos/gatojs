import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import corePl from "@/app/messages/pl.json";
import coreEn from "@/app/messages/en.json";
import legalPl from "../../i18n/pl.json";
import legalEn from "../../i18n/en.json";
import { resolveServerTree } from "../../__tests__/server-tree";
import { legalDocuments } from "../index";
import { legalConfig } from "../../legal.config";

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

const messagesByLocale = {
  pl: { ...corePl, legal: legalPl },
  en: { ...coreEn, legal: legalEn },
};

const featureDir = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(featureDir, "../../..");
const inKitRepo = existsSync(path.join(repoRoot, "kit/kit.json"));

async function loadDocument(
  document: "terms" | "privacy",
  locale: "pl" | "en",
) {
  const loader = legalDocuments[document][locale];
  if (!loader) {
    throw new Error(`missing ${document}.${locale}`);
  }
  return loader();
}

async function renderDocumentHtml(
  document: "terms" | "privacy",
  locale: "pl" | "en",
) {
  const { default: Content } = await loadDocument(document, locale);
  const tree = await resolveServerTree(<Content />);
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={messagesByLocale[locale]}>
      {tree}
    </NextIntlClientProvider>,
  );
}

describe.runIf(inKitRepo)("shipped legal content", () => {
  it("has pl and en loaders for both documents", () => {
    expect(Object.keys(legalDocuments).sort()).toEqual(["privacy", "terms"]);
    expect(Object.keys(legalDocuments.terms).sort()).toEqual(["en", "pl"]);
    expect(Object.keys(legalDocuments.privacy).sort()).toEqual(["en", "pl"]);
  });

  it.each([
    ["terms", "pl"],
    ["terms", "en"],
    ["privacy", "pl"],
    ["privacy", "en"],
  ] as const)(
    "%s.%s has an ISO date as updatedAt and a component",
    async (document, locale) => {
      const loaded = await loadDocument(document, locale);

      expect(loaded.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(loaded.updatedAt))).toBe(false);
      expect(typeof loaded.default).toBe("function");
    },
  );

  it.each(["pl", "en"] as const)(
    "privacy.%s names every cookie GatoJS stores",
    async (locale) => {
      const html = await renderDocumentHtml("privacy", locale);

      expect(html).toContain("better-auth.session_token");
      expect(html).toContain("better-auth.session_data");
      expect(html).toContain("better-auth.dont_remember");
      expect(html).toContain("NEXT_LOCALE");
      expect(html).toContain("cookie_consent");
    },
  );

  it("no content or config file carries the old placeholder app name", () => {
    const contentDir = path.join(featureDir, "content");
    const files = [
      ...readdirSync(contentDir)
        .filter((name) => /\.(ts|tsx)$/.test(name))
        .map((name) => path.join(contentDir, name)),
      path.join(featureDir, "legal.config.ts"),
    ];

    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("WA App");
      expect(source, file).not.toContain("wa-app");
      expect(source, file).not.toContain("wa_app");
    }
  });
});

describe.runIf(inKitRepo)("shipped legal config", () => {
  it("declares no cookie categories, consent version 1 and the default cookie", () => {
    expect(legalConfig).toEqual({
      cookieCategories: [],
      consentVersion: 1,
      consentCookieName: "cookie_consent",
      consentMaxAgeDays: 180,
    });
  });
});
