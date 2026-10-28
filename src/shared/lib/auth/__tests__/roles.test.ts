import { describe, expect, it } from "vitest";
import {
  ORG_ROLES,
  USER_ROLES,
  isGlobalAdmin,
  toOrgRole,
  toUserRole,
} from "@/shared/lib/auth/roles";

describe("roles", () => {
  it("ORG_ROLES ma dokładnie 3 wartości", () => {
    expect(Object.values(ORG_ROLES).sort()).toEqual([
      "admin",
      "member",
      "owner",
    ]);
  });

  it("USER_ROLES ma dokładnie user, admin i superadmin", () => {
    expect(Object.values(USER_ROLES).sort()).toEqual([
      "admin",
      "superadmin",
      "user",
    ]);
  });

  it("USER_ROLES.SUPERADMIN to napis superadmin", () => {
    expect(USER_ROLES.SUPERADMIN).toBe("superadmin");
  });

  it("toOrgRole zawęża nieznane role do member", () => {
    expect(toOrgRole("owner")).toBe("owner");
    expect(toOrgRole("admin")).toBe("admin");
    expect(toOrgRole("admin,member")).toBe("member");
  });

  it.each([
    ["superadmin", "superadmin"],
    ["admin", "admin"],
    ["user", "user"],
  ])("toUserRole(%j) → %s", (input, expected) => {
    expect(toUserRole(input)).toBe(expected);
  });

  it.each([
    ["SuperAdmin"],
    ["SUPERADMIN"],
    [" superadmin"],
    ["root"],
    ["Admin"],
    ["owner"],
    [""],
    [null],
    [undefined],
    [1],
    [{ role: "superadmin" }],
  ])("toUserRole(%j) → user", (input) => {
    expect(toUserRole(input)).toBe("user");
  });
});

describe("isGlobalAdmin", () => {
  it.each([["admin"], ["superadmin"]])("rola %j → true", (role) => {
    expect(isGlobalAdmin(role)).toBe(true);
  });

  it.each([
    ["user"],
    ["owner"],
    ["member"],
    ["SuperAdmin"],
    ["Admin"],
    ["root"],
    [""],
    [null],
    [undefined],
    [true],
    [["admin"]],
  ])("rola %j → false", (role) => {
    expect(isGlobalAdmin(role)).toBe(false);
  });
});
