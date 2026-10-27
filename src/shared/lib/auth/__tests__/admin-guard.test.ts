import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    session: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  isGuardedAdminPath,
  requestedRoleOf,
  roleFromStored,
  targetRoleOf,
} from "../admin-guard";
import { assertAdminActionAllowed } from "../admin-access";

const STORED_USERS: Record<string, { id: string; role: string }> = {
  "super-1": { id: "super-1", role: "superadmin" },
  "admin-1": { id: "admin-1", role: "admin" },
  "user-1": { id: "user-1", role: "user" },
  "42": { id: "42", role: "admin" },
};

const STORED_SESSIONS: Record<
  string,
  { id: string; token: string; userId: string }
> = {
  "token-super": { id: "sess-1", token: "token-super", userId: "super-1" },
  "token-admin": { id: "sess-2", token: "token-admin", userId: "admin-1" },
  "token-user": { id: "sess-3", token: "token-user", userId: "user-1" },
};

type WhereArgs = { where?: { id?: unknown; token?: unknown } };

function strictKey(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid value for where filter: ${JSON.stringify(value)}`);
  }
  return value;
}

function findStoredUser(args: WhereArgs) {
  const id = strictKey(args?.where?.id);
  return id === null ? null : (STORED_USERS[id] ?? null);
}

function findStoredSession(args: WhereArgs) {
  const token = strictKey(args?.where?.token);
  const session = token === null ? undefined : STORED_SESSIONS[token];
  if (!session) {
    return null;
  }
  return { ...session, user: STORED_USERS[session.userId] };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.user.findUnique.mockImplementation(async (args: WhereArgs) =>
    findStoredUser(args),
  );
  mockPrisma.user.findFirst.mockImplementation(async (args: WhereArgs) =>
    findStoredUser(args),
  );
  mockPrisma.session.findUnique.mockImplementation(async (args: WhereArgs) =>
    findStoredSession(args),
  );
  mockPrisma.session.findFirst.mockImplementation(async (args: WhereArgs) =>
    findStoredSession(args),
  );
});

describe("isGuardedAdminPath", () => {
  it.each([
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
    "/admin/create-user",
  ])("%s → strzeżona", (path) => {
    expect(isGuardedAdminPath(path)).toBe(true);
  });

  it.each([
    "/admin/list-users",
    "/admin/stop-impersonating",
    "/sign-in/email",
    "/sign-up/email",
    "/admin/set-role/",
    "/admin/SET-ROLE",
    "admin/set-role",
    "",
  ])("%j → niestrzeżona", (path) => {
    expect(isGuardedAdminPath(path)).toBe(false);
  });
});

describe("requestedRoleOf", () => {
  it.each([
    [{ role: "superadmin" }, "superadmin"],
    [{ role: "admin" }, "admin"],
    [{ role: ["admin"] }, "admin"],
    [{ role: ["superadmin"] }, "superadmin"],
    [{ role: [7, "admin"] }, "admin"],
    [{ data: { role: "superadmin" } }, "superadmin"],
    [{ data: { role: "user" } }, "user"],
    [{ role: undefined }, null],
    [{ role: null }, null],
    [{}, null],
    [{ data: {} }, null],
    [null, null],
    [undefined, null],
    ["superadmin", null],
  ] as const)("%j → %j", (body, expected) => {
    expect(requestedRoleOf(body)).toBe(expected);
  });

  it.each([
    [{ role: ["user", "superadmin"] }],
    [{ role: ["superadmin", "user"] }],
    [{ data: { role: ["user", "superadmin"] } }],
  ] as const)(
    "%j: rola superadmin w wielu rolach jest blokowana dla admina",
    (body) => {
      expect(() =>
        assertAdminActionAllowed({
          path: "/admin/set-role",
          actorRole: "admin",
          targetRole: "user",
          requestedRole: requestedRoleOf(body),
          adminImpersonation: false,
        }),
      ).toThrow(expect.objectContaining({ statusCode: 403 }));
    },
  );
});

describe("roleFromStored", () => {
  it.each([
    ["superadmin", "superadmin"],
    ["admin", "admin"],
    ["user", "user"],
    ["user,superadmin", "superadmin"],
    ["superadmin,user", "superadmin"],
    ["admin, user", "admin"],
    ["user, admin", "admin"],
    [null, "user"],
    [undefined, "user"],
    ["", "user"],
    ["SUPERADMIN", "user"],
    ["root", "user"],
  ] as const)("%j → %s", (stored, expected) => {
    expect(roleFromStored(stored)).toBe(expected);
  });
});

describe("targetRoleOf", () => {
  it.each([
    [{ userId: "super-1" }, "superadmin"],
    [{ userId: "admin-1" }, "admin"],
    [{ userId: "user-1" }, "user"],
    [{ userId: ["super-1"] }, "superadmin"],
    [{ userId: 42 }, "admin"],
    [{ sessionToken: "token-super" }, "superadmin"],
    [{ userId: "ghost-1" }, null],
    [{ sessionToken: "token-ghost" }, null],
    [{}, null],
    [{ data: { role: "superadmin" } }, null],
    [{ userId: "user-1", sessionToken: "token-super" }, "superadmin"],
    [{ sessionToken: "token-super", userId: "user-1" }, "superadmin"],
    [{ userId: "super-1", sessionToken: "token-user" }, "superadmin"],
    [{ userId: "admin-1", sessionToken: "token-user" }, "admin"],
    [{ userId: "user-1", sessionToken: "token-admin" }, "admin"],
    [{ userId: "ghost-1", sessionToken: "token-super" }, "superadmin"],
    [{ userId: undefined, sessionToken: "token-super" }, "superadmin"],
  ] as const)("%j → %j", async (body, expected) => {
    expect(await targetRoleOf(body)).toBe(expected);
  });

  it.each([undefined, null])("%j → null bez wyjątku", async (body) => {
    await expect(targetRoleOf(body)).resolves.toBeNull();
  });
});
