import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { mockGetOrgContext, mockNotFound, mockEnv } = vi.hoisted(() => ({
  mockGetOrgContext: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  mockEnv: { MULTI_ORG: false },
}));

vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/i18n/routing", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("../org-context", () => {
  class NoOrganizationError extends Error {}
  return { NoOrganizationError, getOrgContext: mockGetOrgContext };
});
vi.mock("@/modules.client.generated", async () => {
  const { applyGatoConfig } = await import("@/shared/lib/modules/gato-config");
  const modules: ModuleDef[] = [
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
  return {
    authClientPlugins: [],
    clientModules: applyGatoConfig(modules, {
      modules: {
        users: { access: { roles: ["owner"] } },
        "api-keys": { enabled: false },
      },
    }),
  };
});

import { requireModuleAccess } from "../require-module-access";

function asContext(orgRole: string, userRole = "user") {
  mockGetOrgContext.mockResolvedValue({
    userId: "u1",
    organizationId: "org-1",
    orgRole,
    userRole,
    serviceMode: false,
  });
}

describe("requireModuleAccess with gato.config: users restricted to owner", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
  });

  it("an org admin gets notFound for users with MULTI_ORG", async () => {
    mockEnv.MULTI_ORG = true;
    asContext("admin");
    await expect(requireModuleAccess("users")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("an org admin gets notFound for users without MULTI_ORG", async () => {
    asContext("admin");
    await expect(requireModuleAccess("users")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("an owner enters users without MULTI_ORG", async () => {
    asContext("owner");
    await expect(requireModuleAccess("users")).resolves.toMatchObject({
      userId: "u1",
      orgRole: "owner",
    });
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("an owner enters users with MULTI_ORG", async () => {
    mockEnv.MULTI_ORG = true;
    asContext("owner");
    await expect(requireModuleAccess("users")).resolves.toMatchObject({
      userId: "u1",
    });
  });

  it("an org admin still enters audit-logs, whose policy is not overridden", async () => {
    asContext("admin");
    await expect(requireModuleAccess("audit-logs")).resolves.toMatchObject({
      userId: "u1",
    });
  });
});

describe("requireModuleAccess with gato.config: api-keys disabled", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
  });

  it("an owner gets notFound for api-keys", async () => {
    asContext("owner");
    await expect(requireModuleAccess("api-keys")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("a global superadmin gets notFound for api-keys", async () => {
    asContext("owner", "superadmin");
    await expect(requireModuleAccess("api-keys")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("an enabled module still resolves for a member", async () => {
    asContext("member");
    await expect(requireModuleAccess("dashboard")).resolves.toMatchObject({
      userId: "u1",
    });
  });
});
