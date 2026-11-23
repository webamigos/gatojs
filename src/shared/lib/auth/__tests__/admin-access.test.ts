import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import {
  ADMIN_TARGET_PATHS,
  assertAdminActionAllowed,
  createAdminRoles,
} from "../admin-access";

const TARGET_PATHS = [
  "/admin/set-role",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/update-user",
  "/admin/impersonate-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/list-user-sessions",
] as const;

const NON_IMPERSONATION_TARGET_PATHS = [
  "/admin/set-role",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/update-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/list-user-sessions",
] as const;

type Input = Parameters<typeof assertAdminActionAllowed>[0];

function caughtError(input: Input): unknown {
  try {
    assertAdminActionAllowed(input);
  } catch (error) {
    return error;
  }
  return null;
}

function expectForbidden(input: Input) {
  const error = caughtError(input);
  expect(error).toBeInstanceOf(APIError);
  expect(error).toMatchObject({ status: "FORBIDDEN", statusCode: 403 });
}

function expectAllowed(input: Input) {
  expect(caughtError(input)).toBeNull();
}

describe("ADMIN_TARGET_PATHS", () => {
  it("zawiera dokładnie ścieżki pluginu admin działające na wskazanym użytkowniku", () => {
    expect([...ADMIN_TARGET_PATHS].sort()).toEqual([
      "/admin/ban-user",
      "/admin/impersonate-user",
      "/admin/list-user-sessions",
      "/admin/remove-user",
      "/admin/revoke-user-session",
      "/admin/revoke-user-sessions",
      "/admin/set-role",
      "/admin/set-user-password",
      "/admin/unban-user",
      "/admin/update-user",
    ]);
  });
});

describe("assertAdminActionAllowed: konto superadmina jest nietykalne", () => {
  it.each(
    TARGET_PATHS.flatMap((path) => [
      [path, "admin", false],
      [path, "admin", true],
      [path, "user", false],
      [path, "user", true],
    ]) as [string, "admin" | "user", boolean][],
  )(
    "%s: aktor %s na superadminie (ADMIN_IMPERSONATION=%s) → 403",
    (path, actorRole, adminImpersonation) => {
      expectForbidden({
        path,
        actorRole,
        targetRole: "superadmin",
        requestedRole: null,
        adminImpersonation,
      });
    },
  );

  it.each(NON_IMPERSONATION_TARGET_PATHS)(
    "%s: admin na zwykłym użytkowniku jest przepuszczany",
    (path) => {
      expectAllowed({
        path,
        actorRole: "admin",
        targetRole: "user",
        requestedRole: null,
        adminImpersonation: false,
      });
    },
  );

  it.each(NON_IMPERSONATION_TARGET_PATHS)(
    "%s: admin na innym adminie jest przepuszczany",
    (path) => {
      expectAllowed({
        path,
        actorRole: "admin",
        targetRole: "admin",
        requestedRole: null,
        adminImpersonation: false,
      });
    },
  );

  it.each(NON_IMPERSONATION_TARGET_PATHS)(
    "%s: superadmin na innym superadminie jest przepuszczany",
    (path) => {
      expectAllowed({
        path,
        actorRole: "superadmin",
        targetRole: "superadmin",
        requestedRole: null,
        adminImpersonation: false,
      });
    },
  );

  it.each(NON_IMPERSONATION_TARGET_PATHS)(
    "%s: superadmin na adminie jest przepuszczany",
    (path) => {
      expectAllowed({
        path,
        actorRole: "superadmin",
        targetRole: "admin",
        requestedRole: null,
        adminImpersonation: false,
      });
    },
  );
});

describe("assertAdminActionAllowed: nadanie roli superadmin", () => {
  it.each([
    ["/admin/set-role", "admin", "user"],
    ["/admin/set-role", "admin", "admin"],
    ["/admin/set-role", "user", "user"],
    ["/admin/create-user", "admin", null],
    ["/admin/create-user", "user", null],
  ] as const)(
    "%s: aktor %s nadaje rolę superadmin (cel %s) → 403",
    (path, actorRole, targetRole) => {
      expectForbidden({
        path,
        actorRole,
        targetRole,
        requestedRole: "superadmin",
        adminImpersonation: true,
      });
    },
  );

  it.each([
    ["/admin/set-role", "user"],
    ["/admin/create-user", null],
  ] as const)(
    "%s: superadmin nadaje rolę superadmin (cel %s) → przepuszczony",
    (path, targetRole) => {
      expectAllowed({
        path,
        actorRole: "superadmin",
        targetRole,
        requestedRole: "superadmin",
        adminImpersonation: false,
      });
    },
  );

  it.each([
    ["/admin/set-role", "user", "admin"],
    ["/admin/set-role", "admin", "user"],
    ["/admin/create-user", null, "admin"],
    ["/admin/create-user", null, "user"],
  ] as const)(
    "%s: admin nadaje rolę %s→%s → przepuszczony",
    (path, targetRole, requestedRole) => {
      expectAllowed({
        path,
        actorRole: "admin",
        targetRole,
        requestedRole,
        adminImpersonation: false,
      });
    },
  );

  it("/admin/create-user bez roli przez admina → przepuszczony", () => {
    expectAllowed({
      path: "/admin/create-user",
      actorRole: "admin",
      targetRole: null,
      requestedRole: null,
      adminImpersonation: false,
    });
  });
});

describe("assertAdminActionAllowed: impersonacja", () => {
  it.each([
    ["superadmin", "user", false],
    ["superadmin", "admin", false],
    ["superadmin", "admin", true],
    ["admin", "user", true],
  ] as const)(
    "aktor %s → cel %s (ADMIN_IMPERSONATION=%s) → przepuszczony",
    (actorRole, targetRole, adminImpersonation) => {
      expectAllowed({
        path: "/admin/impersonate-user",
        actorRole,
        targetRole,
        requestedRole: null,
        adminImpersonation,
      });
    },
  );

  it.each([
    ["superadmin", "superadmin", false],
    ["superadmin", "superadmin", true],
    ["admin", "user", false],
    ["admin", "admin", false],
    ["admin", "admin", true],
    ["user", "user", true],
  ] as const)(
    "aktor %s → cel %s (ADMIN_IMPERSONATION=%s) → 403",
    (actorRole, targetRole, adminImpersonation) => {
      expectForbidden({
        path: "/admin/impersonate-user",
        actorRole,
        targetRole,
        requestedRole: null,
        adminImpersonation,
      });
    },
  );
});

const ALL_USER_ACTIONS = [
  "create",
  "list",
  "set-role",
  "ban",
  "impersonate",
  "impersonate-admins",
  "delete",
  "set-password",
  "set-email",
  "set-phone",
  "get",
  "update",
] as const;

const ALL_SESSION_ACTIONS = ["list", "revoke", "delete"] as const;

const ADMIN_BASE_USER_ACTIONS = [
  "create",
  "list",
  "set-role",
  "ban",
  "delete",
  "set-password",
  "set-email",
  "get",
  "update",
] as const;

describe("createAdminRoles", () => {
  it.each([false, true])(
    "ADMIN_IMPERSONATION=%s → role user, admin i superadmin",
    (adminImpersonation) => {
      const { roles } = createAdminRoles({ adminImpersonation });
      expect(Object.keys(roles).sort()).toEqual([
        "admin",
        "superadmin",
        "user",
      ]);
    },
  );

  it.each([false, true])(
    "ADMIN_IMPERSONATION=%s → superadmin ma wszystkie uprawnienia pluginu admin",
    (adminImpersonation) => {
      const { roles } = createAdminRoles({ adminImpersonation });
      expect(
        roles.superadmin.authorize({
          user: [...ALL_USER_ACTIONS],
          session: [...ALL_SESSION_ACTIONS],
        }).success,
      ).toBe(true);
    },
  );

  it.each([false, true])(
    "ADMIN_IMPERSONATION=%s → admin zarządza użytkownikami i sesjami",
    (adminImpersonation) => {
      const { roles } = createAdminRoles({ adminImpersonation });
      expect(
        roles.admin.authorize({
          user: [...ADMIN_BASE_USER_ACTIONS],
          session: [...ALL_SESSION_ACTIONS],
        }).success,
      ).toBe(true);
    },
  );

  it("ADMIN_IMPERSONATION=false → admin nie ma impersonate", () => {
    const { roles } = createAdminRoles({ adminImpersonation: false });
    expect(roles.admin.authorize({ user: ["impersonate"] }).success).toBe(
      false,
    );
  });

  it("ADMIN_IMPERSONATION=true → admin ma impersonate", () => {
    const { roles } = createAdminRoles({ adminImpersonation: true });
    expect(roles.admin.authorize({ user: ["impersonate"] }).success).toBe(true);
  });

  it.each([false, true])(
    "ADMIN_IMPERSONATION=%s → admin nigdy nie ma impersonate-admins",
    (adminImpersonation) => {
      const { roles } = createAdminRoles({ adminImpersonation });
      expect(
        roles.admin.authorize({ user: ["impersonate-admins"] }).success,
      ).toBe(false);
    },
  );

  it.each([
    ["user", "create", false],
    ["user", "list", false],
    ["user", "set-role", false],
    ["user", "ban", false],
    ["user", "impersonate", false],
    ["user", "impersonate-admins", false],
    ["user", "delete", false],
    ["user", "set-password", false],
    ["user", "set-email", false],
    ["user", "get", false],
    ["user", "update", false],
    ["session", "list", false],
    ["session", "revoke", false],
    ["session", "delete", false],
    ["user", "create", true],
    ["user", "list", true],
    ["user", "set-role", true],
    ["user", "ban", true],
    ["user", "impersonate", true],
    ["user", "impersonate-admins", true],
    ["user", "delete", true],
    ["user", "set-password", true],
    ["user", "set-email", true],
    ["user", "get", true],
    ["user", "update", true],
    ["session", "list", true],
    ["session", "revoke", true],
    ["session", "delete", true],
  ] as const)(
    "rola user nie ma %s:%s (ADMIN_IMPERSONATION=%s)",
    (resource, action, adminImpersonation) => {
      const { roles } = createAdminRoles({ adminImpersonation });
      expect(roles.user.authorize({ [resource]: [action] }).success).toBe(
        false,
      );
    },
  );

  it("access control zna zasoby user i session pluginu admin", () => {
    const { ac } = createAdminRoles({ adminImpersonation: false });
    expect(ac.statements).toEqual({
      user: [...ALL_USER_ACTIONS],
      session: [...ALL_SESSION_ACTIONS],
    });
  });
});

describe("assertAdminActionAllowed: nieznany cel akcji (fail-closed)", () => {
  const UNKNOWN_TARGET_MESSAGE = "Brak uprawnień do tego konta";
  const SERVICE_ACCOUNT_MESSAGE =
    "Konto serwisowe może zmieniać tylko superadmin";

  const NON_IMPERSONATION_NULL_TARGET = [
    ["/admin/set-role", "admin"],
    ["/admin/set-role", "user"],
    ["/admin/ban-user", "admin"],
    ["/admin/ban-user", "user"],
    ["/admin/remove-user", "admin"],
    ["/admin/set-user-password", "user"],
    ["/admin/list-user-sessions", "admin"],
  ] as const;

  it.each(NON_IMPERSONATION_NULL_TARGET)(
    "%s: aktor %s, cel nie istnieje → 403 z komunikatem o braku uprawnień do konta",
    (path, actorRole) => {
      const error = caughtError({
        path,
        actorRole,
        targetRole: null,
        requestedRole: null,
        adminImpersonation: false,
      });
      expect(error).toBeInstanceOf(APIError);
      expect(error).toMatchObject({
        status: "FORBIDDEN",
        statusCode: 403,
        body: { message: UNKNOWN_TARGET_MESSAGE },
      });
    },
  );

  it.each([false, true])(
    "ADMIN_IMPERSONATION=%s: admin, cel nie istnieje → nadal 403 (fail-closed)",
    (adminImpersonation) => {
      expectForbidden({
        path: "/admin/set-role",
        actorRole: "admin",
        targetRole: null,
        requestedRole: null,
        adminImpersonation,
      });
    },
  );

  it("admin na superadminie → komunikat o koncie serwisowym", () => {
    const error = caughtError({
      path: "/admin/ban-user",
      actorRole: "admin",
      targetRole: "superadmin",
      requestedRole: null,
      adminImpersonation: false,
    });
    expect(error).toMatchObject({
      status: "FORBIDDEN",
      body: { message: SERVICE_ACCOUNT_MESSAGE },
    });
  });

  it.each(NON_IMPERSONATION_TARGET_PATHS)(
    "%s: superadmin, cel nie istnieje → przepuszczony",
    (path) => {
      expectAllowed({
        path,
        actorRole: "superadmin",
        targetRole: null,
        requestedRole: null,
        adminImpersonation: false,
      });
    },
  );

  it.each(["admin", "user", "superadmin"] as const)(
    "/admin/impersonate-user: aktor %s, cel nie istnieje → komunikat o podszywaniu się",
    (actorRole) => {
      const error = caughtError({
        path: "/admin/impersonate-user",
        actorRole,
        targetRole: null,
        requestedRole: null,
        adminImpersonation: true,
      });
      expect(error).toMatchObject({
        status: "FORBIDDEN",
        body: {
          message: "Brak uprawnień do podszycia się pod tego użytkownika",
        },
      });
    },
  );

  it.each(["admin", "user"] as const)(
    "/admin/list-users: aktor %s, brak celu → przepuszczony",
    (actorRole) => {
      expectAllowed({
        path: "/admin/list-users",
        actorRole,
        targetRole: null,
        requestedRole: null,
        adminImpersonation: false,
      });
    },
  );
});
