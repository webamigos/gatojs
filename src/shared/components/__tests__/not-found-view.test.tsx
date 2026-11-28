import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import plMessages from "@/app/messages/pl.json";
import enMessages from "@/app/messages/en.json";

const { requestLocale } = vi.hoisted(() => ({
  requestLocale: { current: "pl" as "pl" | "en" },
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const pl = (await import("@/app/messages/pl.json")).default;
  const en = (await import("@/app/messages/en.json")).default;
  const translatorFor = (
    namespaceOrOptions?: string | { namespace?: string; locale?: string },
  ) => {
    const options =
      typeof namespaceOrOptions === "string"
        ? { namespace: namespaceOrOptions }
        : (namespaceOrOptions ?? {});
    const locale = options.locale ?? requestLocale.current;
    return createTranslator({
      locale,
      messages: locale === "en" ? en : pl,
      namespace: options.namespace,
    } as Parameters<typeof createTranslator>[0]);
  };
  return {
    getTranslations: vi.fn(async (namespaceOrOptions?: string) =>
      translatorFor(namespaceOrOptions),
    ),
    getLocale: vi.fn(async () => requestLocale.current),
    setRequestLocale: vi.fn(),
  };
});

vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
    className,
  }: ComponentProps<"a"> & { href: string; children: ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function importModule(path: string): Promise<unknown> {
  return import(path);
}

async function renderView(): Promise<void> {
  const { NotFoundView } = (await importModule(
    "@/shared/components/not-found-view",
  )) as { NotFoundView: () => Promise<ReactNode> };
  render(await NotFoundView());
}

describe("common.notFound messages", () => {
  it("Polish messages have the not-found title, description and home link text", () => {
    expect(
      (plMessages.common as Record<string, unknown>).notFound,
    ).toStrictEqual({
      title: "Nie znaleziono strony",
      description:
        "Strona, której szukasz, nie istnieje albo została przeniesiona.",
      backHome: "Wróć na stronę główną",
    });
  });

  it("English messages have the not-found title, description and home link text", () => {
    expect(
      (enMessages.common as Record<string, unknown>).notFound,
    ).toStrictEqual({
      title: "Page not found",
      description:
        "The page you are looking for does not exist or has been moved.",
      backHome: "Back to the home page",
    });
  });
});

describe("NotFoundView", () => {
  beforeEach(() => {
    requestLocale.current = "pl";
  });

  it("in Polish shows the title as a heading, the description and a link to the home page", async () => {
    await renderView();
    expect(
      screen.getByRole("heading", { name: "Nie znaleziono strony" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Strona, której szukasz, nie istnieje albo została przeniesiona.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Wróć na stronę główną" }),
    ).toHaveAttribute("href", "/");
  });

  it("in English shows the English title, description and home link", async () => {
    requestLocale.current = "en";
    await renderView();
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The page you are looking for does not exist or has been moved.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the home page" }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByText("Nie znaleziono strony")).not.toBeInTheDocument();
  });

  it("has exactly one link and it points home", async () => {
    await renderView();
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/"]);
  });
});
