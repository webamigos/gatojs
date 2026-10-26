import { describe, expect, it } from "vitest";
import { ORG_ROLES, USER_ROLES } from "@/shared/lib/auth/roles";

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
});
