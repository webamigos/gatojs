import { describe, expect, it } from "vitest";
import {
  ORG_ROLES,
  USER_ROLES,
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

  it("USER_ROLES ma user i admin", () => {
    expect(Object.values(USER_ROLES).sort()).toEqual(["admin", "user"]);
  });

  it("toOrgRole zawęża nieznane role do member", () => {
    expect(toOrgRole("owner")).toBe("owner");
    expect(toOrgRole("admin")).toBe("admin");
    expect(toOrgRole("admin,member")).toBe("member");
  });

  it("toUserRole zawęża wszystko poza admin do user", () => {
    expect(toUserRole("admin")).toBe("admin");
    expect(toUserRole(null)).toBe("user");
    expect(toUserRole("superadmin")).toBe("user");
  });
});
