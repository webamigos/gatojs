import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePrisma, type FakeTables } from "@/test/fake-prisma";
import type { SwitchableOrganization } from "../../../contracts/organization-switcher.types";

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
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getSwitchableOrganizationsQuery } from "../switchable-organizations-query";

let tables: FakeTables;

function member(id: string, organizationId: string, userId: string) {
  return {
    id,
    organizationId,
    userId,
    role: "member",
    createdAt: new Date("2026-01-01"),
  };
}

function seed() {
  const fake = createFakePrisma({
    users: [
      { id: "u-carol", role: "user" },
      { id: "u-lonely", role: "user" },
      { id: "u-admin", role: "admin" },
      { id: "u-sa", role: "superadmin" },
    ],
    organizations: [
      { id: "org-g", name: "Gamma", createdAt: new Date("2026-01-01") },
      { id: "org-a", name: "Alfa", createdAt: new Date("2026-02-01") },
      { id: "org-b", name: "Beta", createdAt: new Date("2026-03-01") },
    ],
    members: [
      member("m-1", "org-b", "u-carol"),
      member("m-2", "org-g", "u-carol"),
      member("m-3", "org-a", "u-admin"),
      member("m-4", "org-b", "u-sa"),
    ],
    sessions: [],
  });
  database.prisma = fake.prisma;
  tables = fake.tables;
}

function signInAs(userId: string, role: string) {
  mockGetSession.mockResolvedValue({
    user: { id: userId, role },
    session: { id: `s-${userId}`, userId, activeOrganizationId: null },
  });
}

function byName(
  left: SwitchableOrganization,
  right: SwitchableOrganization,
): number {
  return left.name.localeCompare(right.name);
}

describe("getSwitchableOrganizationsQuery", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    seed();
  });

  it("superadmin → wszystkie organizacje po nazwie z oznaczeniem członkostwa", async () => {
    signInAs("u-sa", "superadmin");

    await expect(getSwitchableOrganizationsQuery()).resolves.toEqual([
      { id: "org-a", name: "Alfa", isMember: false },
      { id: "org-b", name: "Beta", isMember: true },
      { id: "org-g", name: "Gamma", isMember: false },
    ]);
  });

  it("użytkownik → tylko jego członkostwa", async () => {
    signInAs("u-carol", "user");

    const organizations = await getSwitchableOrganizationsQuery();

    expect([...organizations].sort(byName)).toEqual([
      { id: "org-b", name: "Beta", isMember: true },
      { id: "org-g", name: "Gamma", isMember: true },
    ]);
  });

  it("globalny admin → tylko jego członkostwa, nie wszystkie organizacje", async () => {
    signInAs("u-admin", "admin");

    await expect(getSwitchableOrganizationsQuery()).resolves.toEqual([
      { id: "org-a", name: "Alfa", isMember: true },
    ]);
  });

  it("użytkownik bez członkostw → pusta lista", async () => {
    signInAs("u-lonely", "user");

    await expect(getSwitchableOrganizationsQuery()).resolves.toEqual([]);
  });

  it("superadmin bez organizacji w bazie → pusta lista", async () => {
    tables.organizations.length = 0;
    tables.members.length = 0;
    signInAs("u-sa", "superadmin");

    await expect(getSwitchableOrganizationsQuery()).resolves.toEqual([]);
  });

  it("brak sesji → żadnych organizacji", async () => {
    mockGetSession.mockResolvedValue(null);

    const outcome = await getSwitchableOrganizationsQuery().then(
      (result) => result,
      () => [],
    );

    expect(outcome).toEqual([]);
  });
});
