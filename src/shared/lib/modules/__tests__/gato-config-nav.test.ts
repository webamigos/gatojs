import { describe, expect, it } from "vitest";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { ModuleDef } from "../define-module";
import { applyGatoConfig, type GatoConfig } from "../gato-config";
import { getNavEntries } from "../nav";

function fixtures(): ModuleDef[] {
  return [
    {
      key: "dashboard",
      nav: [
        {
          id: "dashboard.home",
          href: "/dashboard",
          labelKey: "nav",
          icon: "layout-dashboard",
          order: 10,
        },
      ],
      routePrefixes: ["/dashboard"],
    },
    {
      key: "users",
      nav: [
        {
          id: "users.list",
          href: "/users",
          labelKey: "nav",
          multiOrgLabelKey: "nav-members",
          icon: "users",
          order: 80,
        },
      ],
      routePrefixes: ["/users"],
      adminOnly: true,
      multiOrgRoles: ["owner", "admin"],
    },
    {
      key: "api-keys",
      nav: [
        {
          id: "api-keys.list",
          href: "/api-keys",
          labelKey: "nav",
          icon: "key-round",
          order: 85,
        },
      ],
      routePrefixes: ["/api-keys"],
      roles: ["owner", "admin"],
    },
    {
      key: "audit-logs",
      nav: [
        {
          id: "audit-logs.list",
          href: "/audit-log",
          labelKey: "nav",
          icon: "scroll-text",
          order: 90,
        },
      ],
      routePrefixes: ["/audit-log"],
      roles: ["owner", "admin"],
    },
  ];
}

const usersForOwners: GatoConfig = {
  modules: { users: { access: { roles: ["owner"] } } },
};

const apiKeysDisabled: GatoConfig = {
  modules: { "api-keys": { enabled: false } },
};

function hrefs(context: AccessContext, config: GatoConfig): string[] {
  return getNavEntries(context, applyGatoConfig(fixtures(), config)).map(
    (entry) => entry.href,
  );
}

const orgAdmin = (multiOrg: boolean): AccessContext => ({
  userRole: "user",
  orgRole: "admin",
  multiOrg,
});

const orgOwner = (multiOrg: boolean): AccessContext => ({
  userRole: "user",
  orgRole: "owner",
  multiOrg,
});

describe("getNavEntries with a users access override to owner", () => {
  it("without the override an org admin sees /users with MULTI_ORG", () => {
    expect(hrefs(orgAdmin(true), {})).toEqual([
      "/dashboard",
      "/users",
      "/api-keys",
      "/audit-log",
    ]);
  });

  it("hides /users from an org admin with MULTI_ORG", () => {
    expect(hrefs(orgAdmin(true), usersForOwners)).toEqual([
      "/dashboard",
      "/api-keys",
      "/audit-log",
    ]);
  });

  it("hides /users from an org admin without MULTI_ORG", () => {
    expect(hrefs(orgAdmin(false), usersForOwners)).toEqual([
      "/dashboard",
      "/api-keys",
      "/audit-log",
    ]);
  });

  it("shows /users to an owner without MULTI_ORG", () => {
    expect(hrefs(orgOwner(false), usersForOwners)).toEqual([
      "/dashboard",
      "/users",
      "/api-keys",
      "/audit-log",
    ]);
  });

  it("shows /users to an owner with MULTI_ORG", () => {
    expect(hrefs(orgOwner(true), usersForOwners)).toContain("/users");
  });

  it("hides /users from a member", () => {
    expect(
      hrefs(
        { userRole: "user", orgRole: "member", multiOrg: true },
        usersForOwners,
      ),
    ).toEqual(["/dashboard"]);
  });
});

describe("getNavEntries with api-keys disabled", () => {
  it("an owner has no /api-keys entry", () => {
    expect(hrefs(orgOwner(true), apiKeysDisabled)).toEqual([
      "/dashboard",
      "/users",
      "/audit-log",
    ]);
  });

  it("a global superadmin has no /api-keys entry either", () => {
    expect(
      hrefs(
        { userRole: "superadmin", orgRole: "owner", multiOrg: false },
        apiKeysDisabled,
      ),
    ).toEqual(["/dashboard", "/users", "/audit-log"]);
  });
});

describe("getNavEntries with a nav override", () => {
  it("order 1 on audit-logs.list moves /audit-log to the top", () => {
    expect(
      hrefs(orgOwner(true), {
        modules: { "audit-logs": { nav: { "audit-logs.list": { order: 1 } } } },
      }),
    ).toEqual(["/audit-log", "/dashboard", "/users", "/api-keys"]);
  });

  it("hidden dashboard.home removes /dashboard only", () => {
    expect(
      hrefs(orgOwner(true), {
        modules: { dashboard: { nav: { "dashboard.home": { hidden: true } } } },
      }),
    ).toEqual(["/users", "/api-keys", "/audit-log"]);
  });
});
