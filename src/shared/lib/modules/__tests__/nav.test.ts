import { describe, expect, it } from "vitest";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import { defineModule } from "../define-module";
import { getNavEntries, isActiveEntry } from "../nav";

const member: AccessContext = {
  userRole: "user",
  orgRole: "member",
  multiOrg: false,
};

describe("getNavEntries (rejestr generowany)", () => {
  it("member widzi dashboard i konto, w kolejności order, bez użytkowników", () => {
    expect(getNavEntries(member).map((entry) => entry.href)).toEqual([
      "/dashboard",
      "/account",
    ]);
  });

  it("globalny admin widzi też użytkowników", () => {
    const entries = getNavEntries({ ...member, userRole: "admin" });
    expect(entries.map((entry) => entry.href)).toEqual([
      "/dashboard",
      "/users",
      "/account",
    ]);
  });

  it("superadmin widzi też użytkowników przy MULTI_ORG=false", () => {
    const entries = getNavEntries({ ...member, userRole: "superadmin" });
    expect(entries.map((entry) => entry.href)).toEqual([
      "/dashboard",
      "/users",
      "/account",
    ]);
  });

  it("owner organizacji widzi użytkowników tylko przy MULTI_ORG", () => {
    const owner: AccessContext = { ...member, orgRole: "owner" };
    expect(getNavEntries(owner).map((entry) => entry.href)).not.toContain(
      "/users",
    );
    expect(
      getNavEntries({ ...owner, multiOrg: true }).map((entry) => entry.href),
    ).toContain("/users");
  });

  it("etykieta wskazuje namespace modułu i labelKey", () => {
    expect(getNavEntries(member)[0]?.labelPath).toBe("dashboard.nav");
  });
});

describe("etykieta Członkowie", () => {
  const labelOf = (context: AccessContext) =>
    getNavEntries(context).find((entry) => entry.href === "/users")?.labelPath;

  it("MULTI_ORG i nie-globalny admin → users.nav-members", () => {
    expect(
      labelOf({ userRole: "user", orgRole: "owner", multiOrg: true }),
    ).toBe("users.nav-members");
  });

  it("globalny admin zachowuje users.nav nawet przy MULTI_ORG", () => {
    expect(
      labelOf({ userRole: "admin", orgRole: "member", multiOrg: true }),
    ).toBe("users.nav");
  });

  it.each([["owner"], ["admin"], ["member"]] as const)(
    "superadmin z rolą %s w organizacji zachowuje users.nav przy MULTI_ORG",
    (orgRole) => {
      expect(labelOf({ userRole: "superadmin", orgRole, multiOrg: true })).toBe(
        "users.nav",
      );
    },
  );

  it("bez MULTI_ORG pozostaje users.nav", () => {
    expect(
      labelOf({ userRole: "admin", orgRole: "member", multiOrg: false }),
    ).toBe("users.nav");
  });
});

describe("getNavEntries (przekazane moduły)", () => {
  const custom = [
    defineModule({
      key: "late",
      nav: [{ href: "/late", labelKey: "nav", icon: "x", order: 50 }],
      routePrefixes: ["/late"],
    }),
    defineModule({
      key: "early",
      nav: [{ href: "/early", labelKey: "nav", icon: "x", order: 5 }],
      routePrefixes: ["/early"],
    }),
    defineModule({
      key: "owners",
      nav: [{ href: "/owners", labelKey: "nav", icon: "x", order: 1 }],
      routePrefixes: ["/owners"],
      roles: ["owner"],
    }),
  ];

  it("sortuje po order i filtruje po rolach modułu", () => {
    expect(getNavEntries(member, custom).map((entry) => entry.href)).toEqual([
      "/early",
      "/late",
    ]);
    expect(
      getNavEntries({ ...member, orgRole: "owner" }, custom).map(
        (entry) => entry.href,
      ),
    ).toEqual(["/owners", "/early", "/late"]);
  });
});

describe("isActiveEntry", () => {
  const entries = [
    { href: "/users", labelPath: "", icon: "", order: 1 },
    { href: "/users/archive", labelPath: "", icon: "", order: 2 },
  ];

  it("dokładne dopasowanie", () => {
    expect(isActiveEntry("/users", "/users", entries)).toBe(true);
  });

  it("podścieżka aktywuje rodzica, o ile nie ma dłuższego dopasowania", () => {
    expect(isActiveEntry("/users/42", "/users", entries)).toBe(true);
    expect(isActiveEntry("/users/archive", "/users", entries)).toBe(false);
    expect(isActiveEntry("/users/archive/1", "/users/archive", entries)).toBe(
      true,
    );
  });

  it("przedrostek bez granicy segmentu nie pasuje", () => {
    expect(isActiveEntry("/users-old", "/users", entries)).toBe(false);
  });
});
