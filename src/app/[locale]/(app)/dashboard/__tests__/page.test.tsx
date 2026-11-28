import { cloneElement, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import dashboardEn from "@/features/dashboard/i18n/en.json";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { mockRequireModuleAccess, mockRequireUser, mockEnv, moduleSlots } =
  vi.hoisted(() => ({
    mockRequireModuleAccess: vi.fn(),
    mockRequireUser: vi.fn(),
    mockEnv: { MULTI_ORG: false },
    moduleSlots: [] as Record<string, unknown>[],
  }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(
    async (scope?: string | { namespace?: string }) => (key: string) => {
      const namespace = typeof scope === "string" ? scope : scope?.namespace;
      if (namespace === "dashboard" && key === "title") {
        return "Dashboard";
      }
      return `${namespace ?? ""}.${key}`;
    },
  ),
}));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/auth/require-module-access", () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));
vi.mock("@/shared/lib/auth/helpers", () => ({
  requireUser: mockRequireUser,
}));
vi.mock("@/modules.generated", () => ({ moduleSlots }));
vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    { key: "invoices", nav: [], routePrefixes: ["/invoices"] },
    {
      key: "users",
      nav: [],
      routePrefixes: ["/users"],
      adminOnly: true,
      multiOrgRoles: ["owner", "admin"],
    },
  ];
  return {
    authClientPlugins: [],
    clientModules: modules,
    clientModuleSlots: [],
    gatoBranding: {},
  };
});

import { Slot } from "@/shared/components/slot";
import DashboardPage from "../page";

const params = Promise.resolve({ locale: "en" });
const PLACEHOLDER = "Your application content will appear here.";

function InvoicesCard({ organizationId }: { organizationId: string }) {
  return <section>unpaid invoices of {organizationId}</section>;
}

function invoicesCard(roles?: string[]) {
  return {
    slot: "dashboard.sections",
    id: "invoices.unpaid-card",
    priority: 10,
    roles,
    component: () => Promise.resolve({ default: InvoicesCard }),
    module: "invoices",
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

async function renderPage() {
  const tree = await resolveSlots(await DashboardPage({ params }));
  return render(
    <NextIntlClientProvider locale="en" messages={{ dashboard: dashboardEn }}>
      {tree}
    </NextIntlClientProvider>,
  );
}

describe("/dashboard", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
    setContributions([]);
    mockRequireModuleAccess.mockResolvedValue({
      userId: "u1",
      organizationId: "org-1",
      orgRole: "member",
      userRole: "user",
      serviceMode: false,
    });
    mockRequireUser.mockResolvedValue({
      id: "u1",
      name: "Jan",
      email: "jan@firma.pl",
    });
  });

  it("the page is protected by access to the dashboard module", async () => {
    await renderPage();
    expect(mockRequireModuleAccess).toHaveBeenCalledWith("dashboard");
  });

  it("with no contribution shows the heading and the placeholder", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByText("Welcome, Jan")).toBeInTheDocument();
  });

  it("the placeholder greets by email when the user has no name", async () => {
    mockRequireUser.mockResolvedValue({
      id: "u1",
      name: "",
      email: "jan@firma.pl",
    });
    await renderPage();
    expect(screen.getByText("Welcome, jan@firma.pl")).toBeInTheDocument();
  });

  it("the heading appears once, the placeholder no longer carries its own", async () => {
    await renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("jedyny nagłówek h1 Dashboard leży we wspólnym nagłówku strony", async () => {
    const { container } = await renderPage();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Dashboard");
    expect(
      container.querySelector('header[data-slot="page-header"]'),
    ).toContainElement(headings[0]);
  });

  it("z wkładem w slot nagłówek h1 nadal leży we wspólnym nagłówku strony", async () => {
    setContributions([invoicesCard()]);
    const { container } = await renderPage();
    const header = container.querySelector('header[data-slot="page-header"]');
    expect(header).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    );
    expect(header).not.toContainElement(
      screen.getByText("unpaid invoices of org-1"),
    );
  });

  it("with one visible contribution the placeholder is gone and the heading stays", async () => {
    setContributions([invoicesCard()]);
    await renderPage();
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByText("Welcome, Jan")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("unpaid invoices of org-1")).toBeInTheDocument();
  });

  it("the contribution gets the organizationId of the active organization", async () => {
    mockRequireModuleAccess.mockResolvedValue({
      userId: "u1",
      organizationId: "org-7",
      orgRole: "member",
      userRole: "user",
      serviceMode: false,
    });
    setContributions([invoicesCard()]);
    await renderPage();
    expect(screen.getByText("unpaid invoices of org-7")).toBeInTheDocument();
  });

  it("the contribution is rendered below the heading", async () => {
    setContributions([invoicesCard()]);
    await renderPage();
    const heading = screen.getByRole("heading", { level: 1 });
    const card = screen.getByText("unpaid invoices of org-1");
    expect(
      heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("a contribution for owners only leaves the placeholder for a member", async () => {
    setContributions([invoicesCard(["owner"])]);
    await renderPage();
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(
      screen.queryByText("unpaid invoices of org-1"),
    ).not.toBeInTheDocument();
  });

  it("a contribution for owners only replaces the placeholder for an owner", async () => {
    mockRequireModuleAccess.mockResolvedValue({
      userId: "u1",
      organizationId: "org-1",
      orgRole: "owner",
      userRole: "user",
      serviceMode: false,
    });
    setContributions([invoicesCard(["owner"])]);
    await renderPage();
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.getByText("unpaid invoices of org-1")).toBeInTheDocument();
  });

  it("a contribution for owners only is shown to a superadmin in service mode", async () => {
    mockRequireModuleAccess.mockResolvedValue({
      userId: "sa-1",
      organizationId: "org-9",
      orgRole: "owner",
      userRole: "superadmin",
      serviceMode: true,
    });
    setContributions([invoicesCard(["owner"])]);
    await renderPage();
    expect(screen.getByText("unpaid invoices of org-9")).toBeInTheDocument();
  });

  it("with MULTI_ORG off an owner does not see a users contribution", async () => {
    mockRequireModuleAccess.mockResolvedValue({
      userId: "u1",
      organizationId: "org-1",
      orgRole: "owner",
      userRole: "user",
      serviceMode: false,
    });
    setContributions([{ ...invoicesCard(), module: "users" }]);
    await renderPage();
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("with MULTI_ORG on an owner sees the users contribution", async () => {
    mockEnv.MULTI_ORG = true;
    mockRequireModuleAccess.mockResolvedValue({
      userId: "u1",
      organizationId: "org-1",
      orgRole: "owner",
      userRole: "user",
      serviceMode: false,
    });
    setContributions([{ ...invoicesCard(), module: "users" }]);
    await renderPage();
    expect(screen.getByText("unpaid invoices of org-1")).toBeInTheDocument();
  });

  it("a contribution to another slot leaves the placeholder", async () => {
    setContributions([{ ...invoicesCard(), slot: "account.sections" }]);
    await renderPage();
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("a contribution of a module missing from the registry leaves the placeholder", async () => {
    setContributions([{ ...invoicesCard(), module: "billing" }]);
    await renderPage();
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });
});
