import { describe, expect, it } from "vitest";
import { canAccessPath, type AccessContext } from "../permissions";

function ctx(overrides: Partial<AccessContext>): AccessContext {
  return {
    userRole: "user",
    orgRole: "member",
    multiOrg: false,
    ...overrides,
  };
}

describe("canAccessPath", () => {
  it("globalny admin ma dostęp wszędzie", () => {
    expect(
      canAccessPath("/users", ctx({ userRole: "admin", orgRole: "member" })),
    ).toBe(true);
  });

  it("globalny admin ma dostęp także bez członkostwa i do nieznanej ścieżki", () => {
    expect(
      canAccessPath("/nie-istnieje", ctx({ userRole: "admin", orgRole: null })),
    ).toBe(true);
  });

  it("superadmin ma dostęp do /users jako member organizacji", () => {
    expect(
      canAccessPath(
        "/users",
        ctx({ userRole: "superadmin", orgRole: "member" }),
      ),
    ).toBe(true);
  });

  it("superadmin ma dostęp także bez członkostwa i do nieznanej ścieżki", () => {
    expect(
      canAccessPath(
        "/nie-istnieje",
        ctx({ userRole: "superadmin", orgRole: null }),
      ),
    ).toBe(true);
  });

  it.each([[false], [true]])(
    "superadmin ma dostęp do /users przy MULTI_ORG=%j niezależnie od roli w organizacji",
    (multiOrg) => {
      expect(
        canAccessPath(
          "/users",
          ctx({ userRole: "superadmin", orgRole: "member", multiOrg }),
        ),
      ).toBe(true);
    },
  );

  it("member nie ma dostępu do /users", () => {
    expect(canAccessPath("/users", ctx({}))).toBe(false);
  });

  it("nieznana ścieżka → false", () => {
    expect(canAccessPath("/nie-istnieje", ctx({ orgRole: "owner" }))).toBe(
      false,
    );
  });

  it("/account dla każdego członka", () => {
    expect(canAccessPath("/account", ctx({}))).toBe(true);
  });

  it("/dashboard dla każdego członka", () => {
    expect(canAccessPath("/dashboard", ctx({}))).toBe(true);
  });

  it("moduł public jest dostępny bez członkostwa", () => {
    expect(canAccessPath("/sign-in", ctx({ orgRole: null }))).toBe(true);
  });

  it("brak członkostwa blokuje moduł niepubliczny", () => {
    expect(canAccessPath("/dashboard", ctx({ orgRole: null }))).toBe(false);
  });

  it("podścieżka należy do modułu, a przedrostek bez granicy segmentu nie", () => {
    expect(canAccessPath("/account/security", ctx({}))).toBe(true);
    expect(canAccessPath("/accounting", ctx({}))).toBe(false);
  });

  describe("MULTI_ORG=false", () => {
    it("owner organizacji nie ma dostępu do /users", () => {
      expect(canAccessPath("/users", ctx({ orgRole: "owner" }))).toBe(false);
    });

    it("admin organizacji nie ma dostępu do /users", () => {
      expect(canAccessPath("/users", ctx({ orgRole: "admin" }))).toBe(false);
    });
  });

  describe("MULTI_ORG=true", () => {
    it("owner organizacji ma dostęp do /users", () => {
      expect(
        canAccessPath("/users", ctx({ orgRole: "owner", multiOrg: true })),
      ).toBe(true);
    });

    it("admin organizacji ma dostęp do /users", () => {
      expect(
        canAccessPath("/users", ctx({ orgRole: "admin", multiOrg: true })),
      ).toBe(true);
    });

    it("member nadal nie ma dostępu do /users", () => {
      expect(
        canAccessPath("/users", ctx({ orgRole: "member", multiOrg: true })),
      ).toBe(false);
    });
  });
});
