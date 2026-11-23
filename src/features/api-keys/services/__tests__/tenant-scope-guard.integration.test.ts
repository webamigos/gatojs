import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/shared/lib/prisma";
import {
  TenantScopeError,
  withoutTenantScope,
} from "@/shared/lib/tenant-scope";
import { authenticateApiKey } from "../authenticate-api-key";
import {
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const KEY_A = "wa_app_live_guardKeyOrgA0001";

interface World {
  alice: { id: string };
  orgA: { id: string };
  orgB: { id: string };
  keyA1: { id: string };
  keyA2: { id: string };
  keyB: { id: string };
}

let world: World;
let counter = 0;

function hash(plaintext: string): string {
  return createHmac("sha256", process.env.API_KEY_PEPPER ?? "")
    .update(plaintext)
    .digest("hex");
}

async function seedKey(
  organizationId: string,
  name: string,
  plaintext?: string,
): Promise<{ id: string }> {
  counter += 1;
  return prisma.apiKey.create({
    data: {
      organizationId,
      name,
      displayPrefix: `pfx_${counter}`,
      hashedKey: plaintext === undefined ? `hash-${counter}` : hash(plaintext),
      scopes: ["organization:read"],
    },
    select: { id: true },
  });
}

beforeEach(async () => {
  await resetDatabase();
  counter = 0;
  const alice = await createUser({ email: "alice@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [{ userId: alice.id, role: "owner" }],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "owner" }],
  });
  const keyA1 = await seedKey(orgA.id, "klucz A1", KEY_A);
  const keyA2 = await seedKey(orgA.id, "klucz A2");
  const keyB = await seedKey(orgB.id, "klucz B");
  world = { alice, orgA, orgB, keyA1, keyA2, keyB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("guard organizacji na prawdziwej bazie", () => {
  it("findMany bez filtra organizacji jest odrzucone TenantScopeError z modelem i operacją", async () => {
    const result = prisma.apiKey.findMany({});

    await expect(result).rejects.toBeInstanceOf(TenantScopeError);
    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "ApiKey",
      operation: "findMany",
    });
  });

  it("findMany z filtrem organizacji A zwraca tylko klucze A", async () => {
    const rows = await prisma.apiKey.findMany({
      where: { organizationId: world.orgA.id },
      select: { name: true },
      orderBy: { name: "asc" },
    });

    expect(rows.map((row) => row.name)).toEqual(["klucz A1", "klucz A2"]);
  });

  it("deleteMany po samym id klucza B jest odrzucone, a klucz B zostaje", async () => {
    await expect(
      prisma.apiKey.deleteMany({ where: { id: world.keyB.id } }),
    ).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "ApiKey",
      operation: "deleteMany",
    });

    expect(
      await prisma.apiKey.count({
        where: { id: world.keyB.id, organizationId: world.orgB.id },
      }),
    ).toBe(1);
  });

  it("update po samym id klucza B jest odrzucone, a nazwa klucza B się nie zmienia", async () => {
    await expect(
      prisma.apiKey.update({
        where: { id: world.keyB.id },
        data: { name: "przejęty" },
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: world.keyB.id, organizationId: world.orgB.id },
      select: { name: true },
    });
    expect(row.name).toBe("klucz B");
  });

  it("create przez organization.connect jest odrzucone i nic nie zapisuje", async () => {
    await expect(
      prisma.apiKey.create({
        data: {
          name: "bez organizationId",
          displayPrefix: "pfx_x",
          hashedKey: "hash-x",
          organization: { connect: { id: world.orgA.id } },
        },
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);

    expect(
      await prisma.apiKey.count({ where: { organizationId: world.orgA.id } }),
    ).toBe(2);
  });

  it("withoutTenantScope liczy klucze obu organizacji, a zaraz potem count bez filtra jest odrzucone", async () => {
    const total = await withoutTenantScope("test", () => prisma.apiKey.count());

    expect(total).toBe(3);
    await expect(prisma.apiKey.count()).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "ApiKey",
      operation: "count",
    });
  });

  it("po błędzie w withoutTenantScope następne zapytanie bez filtra jest odrzucone", async () => {
    await expect(
      withoutTenantScope("test", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");

    await expect(prisma.apiKey.findMany()).rejects.toBeInstanceOf(
      TenantScopeError,
    );
  });

  it("withoutTenantScope z pustym powodem jest odrzucone i nie wykonuje zapytania", async () => {
    const run = vi.fn(() =>
      prisma.apiKey.deleteMany({ where: { id: world.keyB.id } }),
    );

    await expect(withoutTenantScope("", run)).rejects.toThrow();

    expect(run).not.toHaveBeenCalled();
    expect(
      await prisma.apiKey.count({ where: { organizationId: world.orgB.id } }),
    ).toBe(1);
  });

  it("member.findMany po userId działa, bo Member jest poza guardem", async () => {
    const rows = await prisma.member.findMany({
      where: { userId: world.alice.id },
      select: { organizationId: true },
    });

    expect(rows).toEqual([{ organizationId: world.orgA.id }]);
  });

  it("authenticateApiKey z poprawnym kluczem przechodzi i aktualizuje lastUsedAt", async () => {
    const result = await authenticateApiKey(
      new Request("http://localhost/api/v1/organization", {
        headers: { authorization: `Bearer ${KEY_A}` },
      }),
      "organization:read",
    );

    expect(result).toEqual({
      ok: true,
      context: {
        organizationId: world.orgA.id,
        apiKeyId: world.keyA1.id,
        scopes: ["organization:read"],
      },
    });
    await vi.waitFor(async () => {
      const row = await prisma.apiKey.findUniqueOrThrow({
        where: { id: world.keyA1.id, organizationId: world.orgA.id },
        select: { lastUsedAt: true },
      });
      expect(row.lastUsedAt).not.toBeNull();
    });
  });

  it("authenticateApiKey z nieznanym kluczem zwraca invalid, a nie błąd guardu", async () => {
    const result = await authenticateApiKey(
      new Request("http://localhost/api/v1/organization", {
        headers: { authorization: "Bearer wa_app_live_nieznany" },
      }),
      "organization:read",
    );

    expect(result).toEqual({ ok: false, status: 401, error: "invalid" });
  });

  it("zapytanie bez filtra w interaktywnej transakcji jest odrzucone", async () => {
    await expect(
      prisma.$transaction(async (tx) => tx.apiKey.count({})),
    ).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "ApiKey",
      operation: "count",
    });
  });

  it("zapytanie z filtrem w interaktywnej transakcji działa", async () => {
    const count = await prisma.$transaction(async (tx) =>
      tx.apiKey.count({ where: { organizationId: world.orgA.id } }),
    );

    expect(count).toBe(2);
  });

  it("zapytanie bez filtra w transakcji wsadowej jest odrzucone", async () => {
    await expect(
      prisma.$transaction([
        prisma.apiKey.count({ where: { organizationId: world.orgA.id } }),
        prisma.apiKey.count(),
      ]),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });
});
