import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakePrisma,
  type FakePrisma,
  type FakeTables,
} from "@/test/fake-prisma";

const { database, mockGetSession } = vi.hoisted(() => ({
  database: { prisma: null as unknown as Record<string, unknown> },
  mockGetSession: vi.fn(),
}));

vi.mock("@/shared/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_target, key: string) => database.prisma[key] },
  ),
}));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { enterOrganizationCommand } from "../enter-organization-command";

const ACCESS_DENIED = { success: false, error: "Brak dostępu do organizacji" };

let tables: FakeTables;
let prisma: FakePrisma;

const USERS = {
  owner: { id: "u-owner", role: "user" },
  outsider: { id: "u-outsider", role: "user" },
  admin: { id: "u-admin", role: "admin" },
  superadmin: { id: "u-sa", role: "superadmin" },
} as const;

function sessionIdOf(userId: string): string {
  return `s-${userId}`;
}

function seed() {
  const fake = createFakePrisma({
    users: Object.values(USERS).map((user) => ({ ...user })),
    organizations: [
      { id: "org-a", name: "Org A", createdAt: new Date("2026-01-01") },
      { id: "org-b", name: "Org B", createdAt: new Date("2026-02-01") },
    ],
    members: [
      {
        id: "m-1",
        organizationId: "org-a",
        userId: USERS.owner.id,
        role: "owner",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "m-2",
        organizationId: "org-a",
        userId: USERS.admin.id,
        role: "member",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "m-3",
        organizationId: "org-a",
        userId: USERS.outsider.id,
        role: "member",
        createdAt: new Date("2026-01-01"),
      },
    ],
    sessions: Object.values(USERS).map((user) => ({
      id: sessionIdOf(user.id),
      userId: user.id,
      token: `token-${user.id}`,
      activeOrganizationId: "org-a",
    })),
  });
  database.prisma = fake.prisma;
  prisma = fake.prisma;
  tables = fake.tables;
}

function signInAs(user: { id: string; role: string }) {
  mockGetSession.mockImplementation(async () => ({
    user: { id: user.id, role: user.role },
    session: {
      id: sessionIdOf(user.id),
      userId: user.id,
      activeOrganizationId: "org-a",
    },
  }));
}

function activeOrganizationOf(userId: string): unknown {
  return tables.sessions.find((row) => row.userId === userId)
    ?.activeOrganizationId;
}

function activeOrganizations(): Record<string, unknown> {
  return Object.fromEntries(
    tables.sessions.map((row) => [row.id, row.activeOrganizationId]),
  );
}

const UNCHANGED = {
  "s-u-owner": "org-a",
  "s-u-outsider": "org-a",
  "s-u-admin": "org-a",
  "s-u-sa": "org-a",
};

describe("enterOrganizationCommand", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    seed();
  });

  it("superadmin bez członkostwa wchodzi do istniejącej organizacji", async () => {
    signInAs(USERS.superadmin);

    const result = await enterOrganizationCommand("org-b");

    expect(result).toMatchObject({ success: true });
    expect(activeOrganizations()).toEqual({ ...UNCHANGED, "s-u-sa": "org-b" });
  });

  it("superadmin → nieistniejąca organizacja → odmowa, sesja bez zmian", async () => {
    signInAs(USERS.superadmin);

    const result = await enterOrganizationCommand("org-missing");

    expect(result).toEqual(ACCESS_DENIED);
    expect(activeOrganizations()).toEqual(UNCHANGED);
  });

  it("członek przełącza się na organizację, do której należy", async () => {
    tables.members.push({
      id: "m-4",
      organizationId: "org-b",
      userId: USERS.owner.id,
      role: "member",
      createdAt: new Date("2026-03-01"),
    });
    signInAs(USERS.owner);

    const result = await enterOrganizationCommand("org-b");

    expect(result).toMatchObject({ success: true });
    expect(activeOrganizationOf(USERS.owner.id)).toBe("org-b");
  });

  it("owner organizacji A → organizacja B bez członkostwa → odmowa, sesja bez zmian", async () => {
    signInAs(USERS.owner);

    const result = await enterOrganizationCommand("org-b");

    expect(result).toEqual(ACCESS_DENIED);
    expect(activeOrganizations()).toEqual(UNCHANGED);
  });

  it("globalny admin bez członkostwa w B → odmowa, sesja bez zmian", async () => {
    signInAs(USERS.admin);

    const result = await enterOrganizationCommand("org-b");

    expect(result).toEqual(ACCESS_DENIED);
    expect(activeOrganizations()).toEqual(UNCHANGED);
  });

  it("członkostwo innego użytkownika w B nie otwiera dostępu", async () => {
    tables.members.push({
      id: "m-5",
      organizationId: "org-b",
      userId: USERS.admin.id,
      role: "owner",
      createdAt: new Date("2026-03-01"),
    });
    signInAs(USERS.outsider);

    const result = await enterOrganizationCommand("org-b");

    expect(result).toEqual(ACCESS_DENIED);
    expect(activeOrganizations()).toEqual(UNCHANGED);
  });

  it("zmienia tylko sesję wywołującego, nie inne sesje tego użytkownika", async () => {
    tables.sessions.push({
      id: "s-u-sa-phone",
      userId: USERS.superadmin.id,
      token: "token-phone",
      activeOrganizationId: "org-a",
    });
    signInAs(USERS.superadmin);

    await enterOrganizationCommand("org-b");

    expect(activeOrganizations()).toEqual({
      ...UNCHANGED,
      "s-u-sa": "org-b",
      "s-u-sa-phone": "org-a",
    });
  });

  it("dwukrotne wejście do tej samej organizacji jest bezpieczne", async () => {
    signInAs(USERS.superadmin);

    await enterOrganizationCommand("org-b");
    const second = await enterOrganizationCommand("org-b");

    expect(second).toMatchObject({ success: true });
    expect(activeOrganizationOf(USERS.superadmin.id)).toBe("org-b");
  });

  it("czyta sesję z pominięciem cookie cache", async () => {
    signInAs(USERS.superadmin);

    await enterOrganizationCommand("org-b");

    expect(mockGetSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("superadmin zdegradowany w bazie, z rolą superadmin w cache → odmowa wejścia do obcej organizacji", async () => {
    const demoted = tables.users.find((row) => row.id === USERS.superadmin.id);
    if (demoted) {
      demoted.role = "admin";
    }
    mockGetSession.mockImplementation(
      async (args?: { query?: { disableCookieCache?: boolean } }) => ({
        user: {
          id: USERS.superadmin.id,
          role: args?.query?.disableCookieCache ? "admin" : "superadmin",
        },
        session: {
          id: sessionIdOf(USERS.superadmin.id),
          userId: USERS.superadmin.id,
          activeOrganizationId: "org-a",
        },
      }),
    );

    const result = await enterOrganizationCommand("org-b");

    expect(result).toEqual(ACCESS_DENIED);
    expect(activeOrganizations()).toEqual(UNCHANGED);
  });

  it.each([" org-b", "org-b ", "\torg-b\n"])(
    "id ze spacjami (%j) nie jest przycinane → odmowa, sesja bez zmian",
    async (input) => {
      signInAs(USERS.superadmin);

      const result = await enterOrganizationCommand(input);

      expect(result.success).toBe(false);
      expect(activeOrganizations()).toEqual(UNCHANGED);
    },
  );

  it.each([
    ["liczba", 42],
    ["pusty napis", ""],
    ["null", null],
    ["obiekt z id", { id: "org-b" }],
    ["tablica", ["org-b"]],
  ])(
    "niepoprawne wejście (%s) → odmowa bez zmiany sesji",
    async (_label, input) => {
      signInAs(USERS.superadmin);

      const result = await enterOrganizationCommand(input);

      expect(result.success).toBe(false);
      expect(activeOrganizations()).toEqual(UNCHANGED);
    },
  );

  it("brak sesji → brak zmiany w żadnej sesji", async () => {
    mockGetSession.mockResolvedValue(null);

    const outcome = await enterOrganizationCommand("org-b").then(
      (result) => result,
      (error: unknown) => error,
    );

    expect(outcome).not.toMatchObject({ success: true });
    expect(activeOrganizations()).toEqual(UNCHANGED);
  });

  it("awaria zapisu sesji → wynik z błędem zamiast wyjątku", async () => {
    signInAs(USERS.superadmin);
    const failure = async () => {
      throw new Error("db down");
    };
    prisma.session.update.mockImplementation(failure);
    prisma.session.updateMany.mockImplementation(failure);

    const result = await enterOrganizationCommand("org-b");

    expect(result.success).toBe(false);
  });
});
