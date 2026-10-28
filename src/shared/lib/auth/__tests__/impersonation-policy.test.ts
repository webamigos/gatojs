import { describe, expect, it } from "vitest";
import { canImpersonate } from "../impersonation-policy";

describe("canImpersonate", () => {
  it.each([
    ["superadmin", "user", false, true],
    ["superadmin", "admin", false, true],
    ["superadmin", "superadmin", false, false],
    ["superadmin", "user", true, true],
    ["superadmin", "admin", true, true],
    ["superadmin", "superadmin", true, false],
    ["admin", "user", false, false],
    ["admin", "admin", false, false],
    ["admin", "superadmin", false, false],
    ["admin", "user", true, true],
    ["admin", "admin", true, false],
    ["admin", "superadmin", true, false],
    ["user", "user", false, false],
    ["user", "admin", false, false],
    ["user", "superadmin", false, false],
    ["user", "user", true, false],
    ["user", "admin", true, false],
    ["user", "superadmin", true, false],
  ] as const)(
    "aktor %s, cel %s, ADMIN_IMPERSONATION=%s → %s",
    (actorRole, targetRole, adminImpersonation, expected) => {
      expect(
        canImpersonate({ actorRole, targetRole, adminImpersonation }),
      ).toBe(expected);
    },
  );
});
