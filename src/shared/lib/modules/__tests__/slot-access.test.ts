import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { OrgRole } from "@/shared/lib/auth/roles";
import type { ModuleDef } from "../define-module";
import type { RegisteredContribution } from "../slots";

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
    {
      key: "reports",
      nav: [],
      routePrefixes: ["/reports"],
      roles: ["owner"],
    },
  ];
  return {
    authClientPlugins: [],
    clientModules: modules,
    clientModuleSlots: [],
    gatoBranding: {},
  };
});

import { moduleVisibleTo, visibleContributions } from "../slot-access";

const Card: ComponentType<{ organizationId: string }> = () => null;
const loader = () => Promise.resolve({ default: Card });

function registered(
  module: string,
  id: string,
  slot = "dashboard.sections",
  roles?: readonly OrgRole[],
): RegisteredContribution {
  return {
    slot,
    id,
    priority: 10,
    roles,
    component: loader,
    module,
    kind: "server",
  } as RegisteredContribution;
}

function viewer(overrides: Partial<AccessContext> = {}): AccessContext {
  return { userRole: "user", orgRole: "member", multiOrg: false, ...overrides };
}

function ids(list: readonly RegisteredContribution[]): string[] {
  return list.map((item) => item.id);
}

describe("visibleContributions", () => {
  it("keeps only the contributions of the requested slot", () => {
    const result = visibleContributions(
      [
        registered("dashboard", "dashboard.card"),
        registered("dashboard", "dashboard.action", "app.header.actions"),
      ],
      "dashboard.sections",
      viewer(),
    );
    expect(ids(result)).toEqual(["dashboard.card"]);
  });

  it("keeps the input order instead of re-sorting", () => {
    const result = visibleContributions(
      [
        registered("dashboard", "dashboard.zeta"),
        registered("dashboard", "dashboard.alpha"),
      ],
      "dashboard.sections",
      viewer(),
    );
    expect(ids(result)).toEqual(["dashboard.zeta", "dashboard.alpha"]);
  });

  it("returns the same contribution objects", () => {
    const card = registered("dashboard", "dashboard.card");
    const [result] = visibleContributions(
      [card],
      "dashboard.sections",
      viewer(),
    );
    expect(result).toBe(card);
  });

  it("hides a contribution whose module is missing from clientModules, as a disabled module is", () => {
    const result = visibleContributions(
      [
        registered("invoices", "invoices.unpaid-card"),
        registered("dashboard", "dashboard.card"),
      ],
      "dashboard.sections",
      viewer({ userRole: "superadmin", orgRole: null }),
    );
    expect(ids(result)).toEqual(["dashboard.card"]);
  });

  it("hides a users contribution from a member when MULTI_ORG is on", () => {
    const result = visibleContributions(
      [registered("users", "users.card")],
      "dashboard.sections",
      viewer({ orgRole: "member", multiOrg: true }),
    );
    expect(result).toEqual([]);
  });

  it("shows a users contribution to an owner when MULTI_ORG is on", () => {
    const result = visibleContributions(
      [registered("users", "users.card")],
      "dashboard.sections",
      viewer({ orgRole: "owner", multiOrg: true }),
    );
    expect(ids(result)).toEqual(["users.card"]);
  });

  it("hides a users contribution from an owner when MULTI_ORG is off", () => {
    const result = visibleContributions(
      [registered("users", "users.card")],
      "dashboard.sections",
      viewer({ orgRole: "owner", multiOrg: false }),
    );
    expect(result).toEqual([]);
  });

  it("hides a contribution of a module limited to owners from a member", () => {
    const result = visibleContributions(
      [registered("reports", "reports.chart")],
      "dashboard.sections",
      viewer({ orgRole: "member" }),
    );
    expect(result).toEqual([]);
  });

  it("shows a users contribution to a global admin", () => {
    const result = visibleContributions(
      [registered("users", "users.card")],
      "dashboard.sections",
      viewer({ userRole: "admin", orgRole: "member", multiOrg: false }),
    );
    expect(ids(result)).toEqual(["users.card"]);
  });

  it("hides a contribution with roles owner from a member of an accessible module", () => {
    const result = visibleContributions(
      [
        registered("dashboard", "dashboard.owner-card", "dashboard.sections", [
          "owner",
        ]),
      ],
      "dashboard.sections",
      viewer({ orgRole: "member" }),
    );
    expect(result).toEqual([]);
  });

  it("shows a contribution with roles owner to an owner", () => {
    const result = visibleContributions(
      [
        registered("dashboard", "dashboard.owner-card", "dashboard.sections", [
          "owner",
        ]),
      ],
      "dashboard.sections",
      viewer({ orgRole: "owner" }),
    );
    expect(ids(result)).toEqual(["dashboard.owner-card"]);
  });

  it("shows a contribution with roles owner to a superadmin without a membership", () => {
    const result = visibleContributions(
      [
        registered("dashboard", "dashboard.owner-card", "dashboard.sections", [
          "owner",
        ]),
      ],
      "dashboard.sections",
      viewer({ userRole: "superadmin", orgRole: null }),
    );
    expect(ids(result)).toEqual(["dashboard.owner-card"]);
  });

  it("hides every contribution from a user without a membership", () => {
    const result = visibleContributions(
      [registered("dashboard", "dashboard.card")],
      "dashboard.sections",
      viewer({ orgRole: null }),
    );
    expect(result).toEqual([]);
  });

  it("filters a mixed list down to what a member may see, in input order", () => {
    const result = visibleContributions(
      [
        registered("reports", "reports.chart"),
        registered("dashboard", "dashboard.first"),
        registered("users", "users.card"),
        registered("dashboard", "dashboard.owner-card", "dashboard.sections", [
          "owner",
        ]),
        registered("invoices", "invoices.unpaid-card"),
        registered("dashboard", "dashboard.other-slot", "account.sections"),
        registered("dashboard", "dashboard.last", "dashboard.sections", [
          "owner",
          "member",
        ]),
      ],
      "dashboard.sections",
      viewer({ orgRole: "member", multiOrg: true }),
    );
    expect(ids(result)).toEqual(["dashboard.first", "dashboard.last"]);
  });
});

describe("moduleVisibleTo", () => {
  it("a module without role limits is visible to a member", () => {
    expect(moduleVisibleTo("dashboard", viewer({ orgRole: "member" }))).toBe(
      true,
    );
  });

  it("a module limited to owners is visible to an owner", () => {
    expect(moduleVisibleTo("reports", viewer({ orgRole: "owner" }))).toBe(true);
  });

  it("a module limited to owners is hidden from a member", () => {
    expect(moduleVisibleTo("reports", viewer({ orgRole: "member" }))).toBe(
      false,
    );
  });

  it("an adminOnly module is hidden from an owner when MULTI_ORG is off", () => {
    expect(
      moduleVisibleTo("users", viewer({ orgRole: "owner", multiOrg: false })),
    ).toBe(false);
  });

  it("an adminOnly module is visible to a global admin without a membership", () => {
    expect(
      moduleVisibleTo("users", viewer({ userRole: "admin", orgRole: null })),
    ).toBe(true);
  });

  it("a module missing from clientModules is hidden even from a superadmin", () => {
    expect(
      moduleVisibleTo(
        "invoices",
        viewer({ userRole: "superadmin", orgRole: null }),
      ),
    ).toBe(false);
  });

  it("a module missing from clientModules is hidden from an owner", () => {
    expect(moduleVisibleTo("invoices", viewer({ orgRole: "owner" }))).toBe(
      false,
    );
  });
});
