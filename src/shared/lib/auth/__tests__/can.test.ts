import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type { OrgContext } from "../org-context";
import type { OrgRole, UserRole } from "../roles";

vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    {
      key: "uploads",
      nav: [],
      routePrefixes: [],
      permissions: {
        "uploads.delete-others": {
          defaultRoles: ["owner", "admin"],
          labelKey: "permission-delete-others",
        },
      },
    },
    {
      key: "reports",
      nav: [],
      routePrefixes: ["/reports"],
      permissions: {
        "reports.export": {
          defaultRoles: ["member"],
          labelKey: "permission-export",
        },
      },
    },
  ];
  return { authClientPlugins: [], clientModules: modules, gatoBranding: {} };
});

import {
  can,
  UnknownPermissionError,
  type AccessContext,
  type PermissionContext,
} from "../permissions";

function ctx(userRole: UserRole, orgRole: OrgRole | null): PermissionContext {
  return { userRole, orgRole };
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("can with the default roles of a permission", () => {
  it("refuses uploads.delete-others to an org member", () => {
    const context: AccessContext = {
      userRole: "user",
      orgRole: "member",
      multiOrg: false,
    };
    expect(can(context, "uploads.delete-others")).toBe(false);
  });

  it("grants uploads.delete-others to an org admin", () => {
    expect(can(ctx("user", "admin"), "uploads.delete-others")).toBe(true);
  });

  it("grants uploads.delete-others to an org owner", () => {
    expect(can(ctx("user", "owner"), "uploads.delete-others")).toBe(true);
  });

  it("grants uploads.delete-others to a superadmin without a membership", () => {
    expect(can(ctx("superadmin", null), "uploads.delete-others")).toBe(true);
  });

  it("grants uploads.delete-others to a global admin without a membership", () => {
    expect(can(ctx("admin", null), "uploads.delete-others")).toBe(true);
  });

  it.each(["admin", "superadmin"] as const)(
    "grants uploads.delete-others to a global %s who is a plain org member",
    (userRole) => {
      expect(can(ctx(userRole, "member"), "uploads.delete-others")).toBe(true);
    },
  );

  it("refuses uploads.delete-others to a user without a membership", () => {
    expect(can(ctx("user", null), "uploads.delete-others")).toBe(false);
  });

  it("grants a permission whose default roles name member to an org member", () => {
    expect(can(ctx("user", "member"), "reports.export")).toBe(true);
  });

  it.each(["owner", "admin"] as const)(
    "refuses a permission granted only to members to an org %s",
    (orgRole) => {
      expect(can(ctx("user", orgRole), "reports.export")).toBe(false);
    },
  );

  it("refuses a permission granted to members to a user without a membership", () => {
    expect(can(ctx("user", null), "reports.export")).toBe(false);
  });

  it("grants a permission granted only to members to a superadmin who is an org owner", () => {
    expect(can(ctx("superadmin", "owner"), "reports.export")).toBe(true);
  });

  it("accepts an org context as returned by getOrgContext", () => {
    const context: OrgContext = {
      userId: "user-1",
      organizationId: "org-1",
      orgRole: "admin",
      userRole: "user",
      serviceMode: false,
    };
    expect(can(context, "uploads.delete-others")).toBe(true);
  });
});

describe("can with an unknown permission key", () => {
  it("throws UnknownPermissionError naming the key", () => {
    expect(
      thrownBy(() => can(ctx("user", "owner"), "uploads.nope")),
    ).toBeInstanceOf(UnknownPermissionError);
    expect(() => can(ctx("user", "owner"), "uploads.nope")).toThrow(
      "unknown permission: uploads.nope",
    );
  });

  it("carries the exact message unknown permission: uploads.nope", () => {
    const error = thrownBy(() => can(ctx("user", "member"), "uploads.nope"));
    expect(error).toBeInstanceOf(UnknownPermissionError);
    expect((error as Error).message).toBe("unknown permission: uploads.nope");
  });

  it("names the error UnknownPermissionError and keeps it an Error", () => {
    const error = thrownBy(() => can(ctx("user", "member"), "uploads.nope"));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("UnknownPermissionError");
  });

  it.each([
    ["superadmin", null],
    ["superadmin", "owner"],
    ["admin", null],
    ["admin", "member"],
    ["user", "owner"],
    ["user", "admin"],
    ["user", "member"],
    ["user", null],
  ] as const)(
    "throws for userRole %s and orgRole %s instead of answering",
    (userRole, orgRole) => {
      expect(() => can(ctx(userRole, orgRole), "uploads.nope")).toThrow(
        "unknown permission: uploads.nope",
      );
    },
  );

  it.each([
    "uploads.delete",
    "uploads",
    "delete-others",
    "",
    "UPLOADS.DELETE-OTHERS",
  ])("throws for %j, which only resembles a declared key", (key) => {
    const error = thrownBy(() => can(ctx("superadmin", null), key));
    expect(error).toBeInstanceOf(UnknownPermissionError);
    expect((error as Error).message).toBe(`unknown permission: ${key}`);
  });

  it.each([
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
  ])("treats the inherited object key %s as unknown for an owner", (key) => {
    expect(() => can(ctx("user", "owner"), key)).toThrow(
      `unknown permission: ${key}`,
    );
  });

  it.each(["constructor", "toString", "__proto__"])(
    "treats the inherited object key %s as unknown for a superadmin",
    (key) => {
      const error = thrownBy(() => can(ctx("superadmin", null), key));
      expect(error).toBeInstanceOf(UnknownPermissionError);
      expect((error as Error).message).toBe(`unknown permission: ${key}`);
    },
  );

  it("throws unknown permission: constructor with that exact message", () => {
    const error = thrownBy(() => can(ctx("user", "member"), "constructor"));
    expect((error as Error).message).toBe("unknown permission: constructor");
  });

  test.prop([
    fc
      .string()
      .filter(
        (key) => key !== "uploads.delete-others" && key !== "reports.export",
      ),
    fc.constantFrom<UserRole>("user", "admin", "superadmin"),
    fc.constantFrom<OrgRole | null>("owner", "admin", "member", null),
  ])(
    "throws UnknownPermissionError for any undeclared key and any role",
    (key, userRole, orgRole) => {
      const error = thrownBy(() => can(ctx(userRole, orgRole), key));
      expect(error).toBeInstanceOf(UnknownPermissionError);
      expect((error as Error).message).toBe(`unknown permission: ${key}`);
    },
  );
});
