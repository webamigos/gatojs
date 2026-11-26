import { describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type { OrgRole, UserRole } from "../roles";

vi.mock("@/modules.client.generated", async () => {
  const { applyGatoConfig } = await import("@/shared/lib/modules/gato-config");
  const modules: ModuleDef[] = [
    {
      key: "uploads",
      nav: [],
      routePrefixes: [],
      permissions: {
        "uploads.delete-others": {
          defaultRoles: ["owner", "admin"],
          labelKey: "permission-delete-others",
        },
        "uploads.purge": {
          defaultRoles: ["admin"],
          labelKey: "permission-purge",
        },
      },
    },
    {
      key: "reports",
      nav: [],
      routePrefixes: ["/reports"],
      permissions: {
        "reports.export": {
          defaultRoles: ["owner", "admin"],
          labelKey: "permission-export",
        },
      },
    },
  ];
  return {
    authClientPlugins: [],
    gatoBranding: {},
    clientModules: applyGatoConfig(modules, {
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["owner"] } },
        reports: { permissions: { "reports.export": ["member"] } },
      },
    }),
  };
});

import { can, type PermissionContext } from "../permissions";

function ctx(userRole: UserRole, orgRole: OrgRole | null): PermissionContext {
  return { userRole, orgRole };
}

describe("can with a gato.config override of uploads.delete-others to owner", () => {
  it("refuses an org admin, whom the default roles allowed", () => {
    expect(can(ctx("user", "admin"), "uploads.delete-others")).toBe(false);
  });

  it("grants an org owner", () => {
    expect(can(ctx("user", "owner"), "uploads.delete-others")).toBe(true);
  });

  it("refuses an org member", () => {
    expect(can(ctx("user", "member"), "uploads.delete-others")).toBe(false);
  });

  it.each(["admin", "superadmin"] as const)(
    "still grants a global %s who is a plain org member",
    (userRole) => {
      expect(can(ctx(userRole, "member"), "uploads.delete-others")).toBe(true);
    },
  );

  it("keeps the default roles of a permission of the same module that the config does not name", () => {
    expect(can(ctx("user", "admin"), "uploads.purge")).toBe(true);
    expect(can(ctx("user", "owner"), "uploads.purge")).toBe(false);
  });
});

describe("can with a gato.config override of reports.export to member", () => {
  it("grants an org member, whom the default roles refused", () => {
    expect(can(ctx("user", "member"), "reports.export")).toBe(true);
  });

  it("refuses an org admin, whom the default roles allowed", () => {
    expect(can(ctx("user", "admin"), "reports.export")).toBe(false);
  });

  it("refuses an org owner, whom the default roles allowed", () => {
    expect(can(ctx("user", "owner"), "reports.export")).toBe(false);
  });

  it("refuses a user without a membership", () => {
    expect(can(ctx("user", null), "reports.export")).toBe(false);
  });
});

describe("can with a gato.config override and an unknown key", () => {
  it("still throws for a key the config does not declare either", () => {
    expect(() => can(ctx("superadmin", null), "reports.nope")).toThrow(
      "unknown permission: reports.nope",
    );
  });
});
