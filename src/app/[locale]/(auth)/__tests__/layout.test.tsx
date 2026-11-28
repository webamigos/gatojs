import {
  cloneElement,
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type { OrgRole } from "@/shared/lib/auth/roles";

const { generatedBranding, moduleSlots, installedModules, mockEnv } =
  vi.hoisted(() => ({
    generatedBranding: {} as {
      logo?: { src: string; alt: string; width: number; height: number };
    },
    moduleSlots: [] as Record<string, unknown>[],
    installedModules: [] as ModuleDef[],
    mockEnv: { MULTI_ORG: false },
  }));

vi.mock("@/modules.client.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.client.generated")>()),
  clientModules: installedModules,
  gatoBranding: generatedBranding,
}));
vi.mock("@/modules.generated", () => ({ moduleSlots }));
vi.mock("@/env", () => ({ env: mockEnv }));

import { Slot } from "@/shared/components/slot";
import AuthLayout from "../layout";

function FooterLinks({ locale }: { locale: string }) {
  return <p>Polityka prywatności ({locale})</p>;
}

function footerContribution(
  module: string,
  id: string,
  roles?: readonly OrgRole[],
) {
  return {
    slot: "auth.footer",
    id,
    priority: 100,
    roles,
    component: () =>
      Promise.resolve({ default: FooterLinks as ComponentType<never> }),
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

async function renderLayout() {
  const tree = await resolveSlots(
    await AuthLayout({
      children: <form aria-label="Sign in form" />,
      params: Promise.resolve({ locale: "pl" }),
    }),
  );
  return render(<>{tree}</>);
}

describe("AuthLayout", () => {
  beforeEach(() => {
    delete generatedBranding.logo;
    setContributions([]);
    installedModules.splice(0, installedModules.length);
  });

  it("without a logo renders the children and no image", async () => {
    await renderLayout();

    expect(
      screen.getByRole("form", { name: "Sign in form" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("without a logo renders no project name", async () => {
    await renderLayout();

    expect(screen.queryByText("WA App")).toBeNull();
  });

  it("with a logo renders the logo image with its alt and the children", async () => {
    generatedBranding.logo = {
      src: "/logo.svg",
      alt: "Acme",
      width: 120,
      height: 32,
    };
    await renderLayout();

    const logo = screen.getByRole("img", { name: "Acme" });
    expect(logo).toHaveAttribute("alt", "Acme");
    expect(logo.getAttribute("src")).toContain("/logo.svg");
    expect(logo).toHaveAttribute("width", "120");
    expect(logo).toHaveAttribute("height", "32");
    expect(
      screen.getByRole("form", { name: "Sign in form" }),
    ).toBeInTheDocument();
  });

  it("with a logo the logo comes before the children", async () => {
    generatedBranding.logo = {
      src: "/logo.svg",
      alt: "Acme",
      width: 120,
      height: 32,
    };
    await renderLayout();

    const logo = screen.getByRole("img", { name: "Acme" });
    const form = screen.getByRole("form", { name: "Sign in form" });
    expect(
      logo.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe("AuthLayout footer slot", () => {
  beforeEach(() => {
    delete generatedBranding.logo;
    setContributions([]);
    installedModules.splice(
      0,
      installedModules.length,
      { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
      { key: "pages", nav: [], routePrefixes: ["/pages"], public: true },
    );
  });

  it("renders a visible auth.footer contribution with the locale inside a footer landmark", async () => {
    setContributions([footerContribution("pages", "pages.links")]);
    await renderLayout();

    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByText("Polityka prywatności (pl)"),
    ).toBeInTheDocument();
  });

  it("puts the footer after the page", async () => {
    setContributions([footerContribution("pages", "pages.links")]);
    await renderLayout();

    const form = screen.getByRole("form", { name: "Sign in form" });
    const footer = screen.getByRole("contentinfo");
    expect(
      form.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("without contributions renders no footer landmark", async () => {
    await renderLayout();

    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
  });

  it("hides a contribution of a module that is not public and leaves no footer", async () => {
    setContributions([footerContribution("dashboard", "dashboard.links")]);
    await renderLayout();

    expect(screen.queryByText(/Polityka prywatności/)).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
  });

  it("hides a public module's contribution limited to owners and leaves no footer", async () => {
    setContributions([footerContribution("pages", "pages.links", ["owner"])]);
    await renderLayout();

    expect(screen.queryByText(/Polityka prywatności/)).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
  });
});
