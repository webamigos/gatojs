import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  ORG_ROLES,
  USER_ROLES,
  isGlobalAdmin,
  isOrgRole,
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

describe("isOrgRole", () => {
  it.each([["owner"], ["admin"], ["member"]])("rola %j → true", (role) => {
    expect(isOrgRole(role)).toBe(true);
  });

  it.each([
    ["Admin"],
    ["OWNER"],
    ["admin "],
    [" member"],
    ["admin,member"],
    ["member,member"],
    ["owner,"],
    ["adm"],
    ["administrator"],
    ["members"],
    [""],
    [["admin"]],
    [["admin", "member"]],
    [["member"]],
    [[]],
    [{ role: "admin" }],
    [new String("admin")],
    [undefined],
    [null],
    [1],
    [true],
    ["superadmin"],
    ["user"],
  ])("rola %j → false", (role) => {
    expect(isOrgRole(role)).toBe(false);
  });

  test.prop([
    fc
      .string()
      .filter((value) => !["owner", "admin", "member"].includes(value)),
  ])("każdy inny napis niż owner, admin i member → false", (value) => {
    expect(isOrgRole(value)).toBe(false);
  });

  test.prop([
    fc.constantFrom("owner", "admin", "member"),
    fc.constantFrom("owner", "admin", "member"),
    fc.constantFrom(",", " ", ", ", "\n"),
  ])("lista dwóch ról organizacji → false", (first, second, separator) => {
    expect(isOrgRole(`${first}${separator}${second}`)).toBe(false);
    expect(isOrgRole([first, second])).toBe(false);
    expect(isOrgRole([first])).toBe(false);
  });

  test.prop([
    fc.constantFrom("owner", "admin", "member"),
    fc.string({ minLength: 1 }),
  ])("rola z dowolnym doklejonym napisem → false", (role, extra) => {
    expect(isOrgRole(`${role}${extra}`)).toBe(false);
    expect(isOrgRole(`${extra}${role}`)).toBe(false);
  });

  test.prop([
    fc.constantFrom("owner", "admin", "member").chain((role) =>
      fc
        .array(fc.boolean(), { minLength: role.length, maxLength: role.length })
        .map((flags) =>
          [...role]
            .map((letter, index) =>
              flags[index] ? letter.toUpperCase() : letter,
            )
            .join(""),
        )
        .filter((variant) => variant !== role),
    ),
  ])("rola z inną wielkością liter → false", (variant) => {
    expect(isOrgRole(variant)).toBe(false);
  });

  test.prop([fc.anything().filter((value) => typeof value !== "string")])(
    "wartość, która nie jest napisem → false",
    (value) => {
      expect(isOrgRole(value)).toBe(false);
    },
  );
});
