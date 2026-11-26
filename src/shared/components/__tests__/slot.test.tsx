import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { moduleSlots } = vi.hoisted(() => {
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
      kind: "server",
    };
  }
  return {
    moduleSlots: [
      entry("dashboard", "dashboard.b", "dashboard.sections", 10),
      entry("dashboard", "dashboard.c", "dashboard.sections", 10),
      entry("dashboard", "dashboard.a", "dashboard.sections", 20),
      entry("dashboard", "dashboard.owner-card", "account.sections", 5, [
        "owner",
      ]),
      entry("invoices", "invoices.unpaid-card", "account.sections", 6),
      entry("users", "users.card", "app.header.actions", 1),
    ],
  };
});

vi.mock("@/modules.generated", () => ({ moduleSlots }));
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
    clientModuleSlots: [],
    gatoBranding: {},
  };
});

import { Slot } from "../slot";

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

describe("Slot", () => {
  it("renders the contributions of the slot in registry order b, c, a", async () => {
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(contributionTexts().map((text) => text.split(" ")[0])).toEqual([
      "dashboard.b",
      "dashboard.c",
      "dashboard.a",
    ]);
  });

  it("passes the context to each contribution as props", async () => {
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(contributionTexts()).toHaveLength(3);
    for (const text of contributionTexts()) {
      expect(text).toContain("organizationId=org-1");
    }
  });

  it("with a visible contribution renders it and not the fallback", async () => {
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
    expect(contributionTexts()).toHaveLength(3);
  });

  it("with no visible contribution renders the fallback", async () => {
    render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: MEMBER,
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
    expect(contributionTexts()).toEqual([]);
  });

  it("with no visible contribution and no fallback renders nothing", async () => {
    const { container } = render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a roles owner contribution to an owner with the userId context", async () => {
    render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: { ...MEMBER, orgRole: "owner" },
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(contributionTexts()).toEqual([
      "dashboard.owner-card organizationId=undefined userId=user-1",
    ]);
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("hides a contribution of a module missing from clientModules even from a superadmin", async () => {
    render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: { userRole: "superadmin", orgRole: null, multiOrg: false },
        })}
      </>,
    );
    expect(contributionTexts().map((text) => text.split(" ")[0])).toEqual([
      "dashboard.owner-card",
    ]);
  });

  it("hides a contribution of a module the viewer cannot access", async () => {
    render(
      <>
        {await Slot({
          id: "app.header.actions",
          context: { organizationId: "org-1" },
          viewer: { ...MEMBER, multiOrg: true },
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
  });

  it("shows that contribution to an owner when MULTI_ORG is on", async () => {
    render(
      <>
        {await Slot({
          id: "app.header.actions",
          context: { organizationId: "org-2" },
          viewer: { ...MEMBER, orgRole: "owner", multiOrg: true },
        })}
      </>,
    );
    expect(contributionTexts()).toEqual([
      "users.card organizationId=org-2 userId=undefined",
    ]);
  });
});
