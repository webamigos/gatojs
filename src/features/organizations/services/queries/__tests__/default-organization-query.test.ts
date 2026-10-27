import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePrisma, type FakePrisma } from "@/test/fake-prisma";

const { database } = vi.hoisted(() => ({
  database: { prisma: null as unknown as Record<string, unknown> },
}));

vi.mock("@/shared/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_target, key: string) => database.prisma[key] },
  ),
}));
vi.mock("@/shared/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { getDefaultActiveOrganizationId } from "../default-organization-query";

let prisma: FakePrisma;

function seed() {
  const fake = createFakePrisma({
    users: [
      { id: "u1", role: "user" },
      { id: "u2", role: "user" },
      { id: "a1", role: "admin" },
      { id: "sa1", role: "superadmin" },
      { id: "sa2", role: "superadmin" },
    ],
    organizations: [
      { id: "org-b", name: "B", createdAt: new Date("2026-02-01T00:00:00Z") },
      { id: "org-a", name: "A", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "org-old", name: "Z", createdAt: new Date("2025-06-01T00:00:00Z") },
    ],
    members: [
      {
        id: "m1",
        organizationId: "org-b",
        userId: "u1",
        role: "member",
        createdAt: new Date("2026-03-01T00:00:00Z"),
      },
      {
        id: "m2",
        organizationId: "org-a",
        userId: "u1",
        role: "member",
        createdAt: new Date("2026-02-15T00:00:00Z"),
      },
      {
        id: "m3",
        organizationId: "org-b",
        userId: "sa2",
        role: "member",
        createdAt: new Date("2026-03-01T00:00:00Z"),
      },
    ],
    sessions: [],
  });
  database.prisma = fake.prisma;
  prisma = fake.prisma;
}

describe("getDefaultActiveOrganizationId", () => {
  beforeEach(() => {
    seed();
  });

  it("zwraca najstarsze członkostwo użytkownika", async () => {
    await expect(getDefaultActiveOrganizationId("u1")).resolves.toBe("org-a");
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("brak członkostwa → null", async () => {
    await expect(getDefaultActiveOrganizationId("u2")).resolves.toBeNull();
  });

  it("globalny admin bez członkostwa → null, nie najstarsza organizacja", async () => {
    await expect(getDefaultActiveOrganizationId("a1")).resolves.toBeNull();
  });

  it("superadmin bez członkostwa → najstarsza organizacja", async () => {
    await expect(getDefaultActiveOrganizationId("sa1")).resolves.toBe(
      "org-old",
    );
  });

  it("superadmin z członkostwem → organizacja z członkostwa, nie najstarsza", async () => {
    await expect(getDefaultActiveOrganizationId("sa2")).resolves.toBe("org-b");
  });

  it("superadmin bez członkostwa i bez organizacji → null", async () => {
    const fake = createFakePrisma({
      users: [{ id: "sa1", role: "superadmin" }],
      organizations: [],
      members: [],
      sessions: [],
    });
    database.prisma = fake.prisma;

    await expect(getDefaultActiveOrganizationId("sa1")).resolves.toBeNull();
  });

  it("nieistniejący użytkownik → null", async () => {
    await expect(
      getDefaultActiveOrganizationId("missing-user"),
    ).resolves.toBeNull();
  });

  it("błąd bazy nie blokuje logowania → null", async () => {
    prisma.member.findFirst.mockRejectedValueOnce(new Error("db down"));
    await expect(getDefaultActiveOrganizationId("u1")).resolves.toBeNull();
  });

  it("błąd bazy przy wyborze organizacji superadmina → null", async () => {
    const failure = async () => {
      throw new Error("db down");
    };
    prisma.organization.findFirst.mockImplementation(failure);
    prisma.organization.findMany.mockImplementation(failure);
    prisma.organization.findFirstOrThrow.mockImplementation(failure);

    await expect(getDefaultActiveOrganizationId("sa1")).resolves.toBeNull();
  });
});
