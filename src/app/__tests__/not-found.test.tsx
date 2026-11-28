import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { existsSync } from "node:fs";
import path from "node:path";

const { NOT_FOUND_MARKER, localeRedirect } = vi.hoisted(() => ({
  NOT_FOUND_MARKER: "NEXT_NOT_FOUND_TEST_MARKER",
  localeRedirect: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({
  redirect: localeRedirect,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error(NOT_FOUND_MARKER);
  }),
  redirect: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getLocale: vi.fn(async () => "pl"),
  getMessages: vi.fn(async () => ({})),
  setRequestLocale: vi.fn(),
}));

vi.mock("@/shared/components/not-found-view", () => ({
  NotFoundView: () => <main data-testid="not-found-view">not-found-view</main>,
}));

type PageComponent = (props: {
  params: Promise<Record<string, string | string[]>>;
}) => unknown;

function importModule(path: string): Promise<unknown> {
  return import(path);
}

async function renderComponent(component: () => unknown): Promise<void> {
  const element = (await component()) as ReactNode;
  render(<>{element}</>);
}

describe("unknown paths under a locale", () => {
  it("the core has no catch-all page under a locale", () => {
    expect(
      existsSync(
        path.join(process.cwd(), "src/app/[locale]/[...rest]/page.tsx"),
      ),
    ).toBe(false);
  });
});

describe("locale home page", () => {
  it("strona główna po polsku przekierowuje na /dashboard z językiem pl", async () => {
    const Page = (
      (await importModule("@/app/[locale]/page")) as {
        default: PageComponent;
      }
    ).default;
    await Page({ params: Promise.resolve({ locale: "pl" }) });
    expect(localeRedirect).toHaveBeenCalledTimes(1);
    expect(localeRedirect).toHaveBeenCalledWith({
      href: "/dashboard",
      locale: "pl",
    });
  });

  it("strona główna po angielsku przekierowuje na /dashboard z językiem en", async () => {
    const Page = (
      (await importModule("@/app/[locale]/page")) as {
        default: PageComponent;
      }
    ).default;
    await Page({ params: Promise.resolve({ locale: "en" }) });
    expect(localeRedirect).toHaveBeenCalledTimes(1);
    expect(localeRedirect).toHaveBeenCalledWith({
      href: "/dashboard",
      locale: "en",
    });
  });
});

describe("not-found pages", () => {
  it("the locale not-found page renders the shared not-found view", async () => {
    const NotFound = (
      (await importModule("@/app/[locale]/not-found")) as {
        default: () => unknown;
      }
    ).default;
    await renderComponent(NotFound);
    expect(screen.getByTestId("not-found-view")).toBeInTheDocument();
  });

  it("the root not-found page renders the shared not-found view", async () => {
    const NotFound = (
      (await importModule("@/app/not-found")) as { default: () => unknown }
    ).default;
    await renderComponent(NotFound);
    expect(screen.getByTestId("not-found-view")).toBeInTheDocument();
  });
});
