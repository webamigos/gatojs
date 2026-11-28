import {
  cloneElement,
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type { OrgRole } from "@/shared/lib/auth/roles";

const { moduleSlots, installedModules, mockEnv } = vi.hoisted(() => ({
  moduleSlots: [] as Record<string, unknown>[],
  installedModules: [] as ModuleDef[],
  mockEnv: { MULTI_ORG: false },
}));

vi.mock("next-intl/server", () => ({
  getMessages: vi.fn(async () => ({})),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["pl", "en"], defaultLocale: "pl" },
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/modules.client.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.client.generated")>()),
  clientModules: installedModules,
}));
vi.mock("@/modules.generated", () => ({ moduleSlots }));
vi.mock("@/env", () => ({ env: mockEnv }));

import { Slot } from "@/shared/components/slot";
import LocaleLayout from "../layout";

function RootBanner({ locale }: { locale: string }) {
  return <p>Baner główny ({locale})</p>;
}

function rootContribution(
  module: string,
  id: string,
  roles?: readonly OrgRole[],
) {
  return {
    slot: "app.root",
    id,
    priority: 1000,
    roles,
    component: () =>
      Promise.resolve({ default: RootBanner as ComponentType<never> }),
    module,
    kind: "server",
  };
}

function setContributions(items: Record<string, unknown>[]) {
  moduleSlots.splice(0, moduleSlots.length, ...items);
}

async function resolveSlots(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child: ReactNode) => resolveSlots(child)));
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return node;
  }
  if (node.type === Slot) {
    return resolveSlots(await Slot(node.props as Parameters<typeof Slot>[0]));
  }
  if (node.props.children === undefined) {
    return node;
  }
  return cloneElement(node, undefined, await resolveSlots(node.props.children));
}

async function renderLayout(locale = "en") {
  const tree = await resolveSlots(
    await LocaleLayout({
      children: <main>Treść strony</main>,
      params: Promise.resolve({ locale }),
    }),
  );
  return render(<>{tree}</>);
}

describe("LocaleLayout app.root slot", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
    setContributions([]);
    installedModules.splice(
      0,
      installedModules.length,
      { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
      { key: "pages", nav: [], routePrefixes: ["/pages"], public: true },
    );
  });

  it("renders a public module's app.root contribution with the locale", async () => {
    setContributions([rootContribution("pages", "pages.banner")]);
    await renderLayout("en");

    expect(screen.getByText("Baner główny (en)")).toBeInTheDocument();
  });

  it("renders the app.root contributions after the children", async () => {
    setContributions([rootContribution("pages", "pages.banner")]);
    await renderLayout();

    const page = screen.getByRole("main");
    const banner = screen.getByText("Baner główny (en)");
    expect(
      page.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not render a contribution of a module that is not public", async () => {
    setContributions([rootContribution("dashboard", "dashboard.banner")]);
    await renderLayout();

    expect(screen.queryByText(/Baner główny/)).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("Treść strony");
  });

  it("does not render a public module's contribution limited to owners", async () => {
    setContributions([rootContribution("pages", "pages.owner", ["owner"])]);
    await renderLayout();

    expect(screen.queryByText(/Baner główny/)).toBeNull();
  });

  it("does not render a non-public contribution with MULTI_ORG on either", async () => {
    mockEnv.MULTI_ORG = true;
    setContributions([rootContribution("dashboard", "dashboard.banner")]);
    await renderLayout();

    expect(screen.queryByText(/Baner główny/)).toBeNull();
  });
});
