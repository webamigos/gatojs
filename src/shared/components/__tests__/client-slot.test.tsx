import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { clientModuleSlots, countedLoader } = vi.hoisted(() => {
  function card(label: string) {
    return function Card(props: Record<string, unknown>) {
      return (
        <p data-testid="contribution">
          {`${label} organizationId=${String(props.organizationId)} userId=${String(props.userId)}`}
        </p>
      );
    };
  }
  function entry(
    module: string,
    id: string,
    slot: string,
    priority: number,
    roles?: string[],
  ) {
    const Component = card(id);
    return {
      slot,
      id,
      priority,
      roles,
      component: () => Promise.resolve({ default: Component }),
      module,
      kind: "client",
    };
  }
  const Counted = card("dashboard.counted");
  const countedLoader = vi.fn(() => Promise.resolve({ default: Counted }));
  return {
    countedLoader,
    clientModuleSlots: [
      entry("dashboard", "dashboard.b", "dashboard.sections", 10),
      entry("dashboard", "dashboard.c", "dashboard.sections", 10),
      entry("dashboard", "dashboard.a", "dashboard.sections", 20),
      entry("dashboard", "dashboard.owner-card", "account.sections", 5, [
        "owner",
      ]),
      entry("invoices", "invoices.unpaid-card", "account.sections", 6),
      entry("users", "users.card", "app.header.actions", 1),
      {
        slot: "users.toolbar",
        id: "dashboard.counted",
        priority: 1,
        roles: undefined,
        component: countedLoader,
        module: "dashboard",
        kind: "client",
      },
    ],
  };
});

vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
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
    clientModuleSlots,
    gatoBranding: {},
  };
});

import { ClientSlot } from "../client-slot";

const MEMBER: AccessContext = {
  userRole: "user",
  orgRole: "member",
  multiOrg: false,
};

function contributionTexts(): string[] {
  return screen
    .queryAllByTestId("contribution")
    .map((element) => element.textContent ?? "");
}

describe("ClientSlot", () => {
  it("renders the lazy contributions of the slot in registry order b, c, a", async () => {
    render(
      <ClientSlot
        id="dashboard.sections"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
      />,
    );
    expect(await screen.findAllByTestId("contribution")).toHaveLength(3);
    expect(contributionTexts().map((text) => text.split(" ")[0])).toEqual([
      "dashboard.b",
      "dashboard.c",
      "dashboard.a",
    ]);
  });

  it("passes the context to each contribution as props", async () => {
    render(
      <ClientSlot
        id="dashboard.sections"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.b organizationId=org-1 userId=undefined",
      ),
    ).toBeInTheDocument();
    expect(contributionTexts()).toEqual([
      "dashboard.b organizationId=org-1 userId=undefined",
      "dashboard.c organizationId=org-1 userId=undefined",
      "dashboard.a organizationId=org-1 userId=undefined",
    ]);
  });

  it("with a visible contribution renders it and not the fallback", async () => {
    render(
      <ClientSlot
        id="dashboard.sections"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(await screen.findAllByTestId("contribution")).toHaveLength(3);
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("with no visible contribution renders the fallback", () => {
    render(
      <ClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={MEMBER}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
    expect(contributionTexts()).toEqual([]);
  });

  it("with no visible contribution and no fallback renders nothing", () => {
    const { container } = render(
      <ClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={MEMBER}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a roles owner contribution to an owner with the userId context", async () => {
    render(
      <ClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={{ ...MEMBER, orgRole: "owner" }}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.owner-card organizationId=undefined userId=user-1",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("hides a contribution of a module missing from clientModules even from a superadmin", async () => {
    render(
      <ClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={{ userRole: "superadmin", orgRole: null, multiOrg: false }}
      />,
    );
    expect(await screen.findAllByTestId("contribution")).toHaveLength(1);
    expect(contributionTexts()).toEqual([
      "dashboard.owner-card organizationId=undefined userId=user-1",
    ]);
  });

  it("hides a contribution of a module the viewer cannot access", () => {
    render(
      <ClientSlot
        id="app.header.actions"
        context={{ organizationId: "org-1" }}
        viewer={{ ...MEMBER, multiOrg: true }}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
  });

  it("shows that contribution to an owner when MULTI_ORG is on", async () => {
    render(
      <ClientSlot
        id="app.header.actions"
        context={{ organizationId: "org-2" }}
        viewer={{ ...MEMBER, orgRole: "owner", multiOrg: true }}
      />,
    );
    expect(
      await screen.findByText(
        "users.card organizationId=org-2 userId=undefined",
      ),
    ).toBeInTheDocument();
  });

  it("loads a contribution once across re-renders", async () => {
    const { rerender } = render(
      <ClientSlot
        // @ts-expect-error users.toolbar is a fixture slot outside SlotContextMap
        id="users.toolbar"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.counted organizationId=org-1 userId=undefined",
      ),
    ).toBeInTheDocument();
    rerender(
      <ClientSlot
        // @ts-expect-error users.toolbar is a fixture slot outside SlotContextMap
        id="users.toolbar"
        context={{ organizationId: "org-3" }}
        viewer={MEMBER}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.counted organizationId=org-3 userId=undefined",
      ),
    ).toBeInTheDocument();
    expect(countedLoader).toHaveBeenCalledTimes(1);
  });
});
