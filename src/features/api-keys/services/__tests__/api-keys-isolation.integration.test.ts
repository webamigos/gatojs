import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { currentSession } = vi.hoisted(() => ({
  currentSession: {
    value: null as null | {
      user: { id: string; role: string };
      session: { id: string; activeOrganizationId: string | null };
    },
  },
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => currentSession.value) } },
}));

import { prisma } from "@/shared/lib/prisma";
import {
  createApiKeyCommand,
  deleteApiKeyCommand,
  revokeApiKeyCommand,
} from "../commands/api-key-commands";
import { listApiKeysQuery } from "../queries/api-key-queries";
import {
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const DAY_MS = 24 * 60 * 60 * 1000;
const YESTERDAY = new Date(Date.now() - DAY_MS);
const IN_A_MONTH = new Date(Date.now() + 30 * DAY_MS);

const VALID_INPUT = {
  name: "Nowy klucz",
  scopes: ["organization:read"],
  expiresInDays: null,
};

interface World {
  alice: { id: string };
  bob: { id: string };
  carol: { id: string };
  orgA: { id: string };
  orgB: { id: string };
}

let world: World;
let counter = 0;

async function signInAs(
  user: { id: string },
  organization: { id: string },
): Promise<void> {
  const session = await createSession({
    userId: user.id,
    activeOrganizationId: organization.id,
  });
  currentSession.value = {
    user: { id: user.id, role: "user" },
    session: { id: session.id, activeOrganizationId: organization.id },
  };
}

async function seedKey(
  organizationId: string,
  overrides: {
    name?: string;
    revokedAt?: Date | null;
    expiresAt?: Date | null;
    createdById?: string | null;
  } = {},
): Promise<{ id: string }> {
  counter += 1;
  return prisma.apiKey.create({
    data: {
      organizationId,
      name: overrides.name ?? `klucz-${counter}`,
      displayPrefix: `pfx_${counter}`,
      hashedKey: `hash-${counter}`,
      scopes: ["organization:read"],
      revokedAt: overrides.revokedAt ?? null,
      expiresAt: overrides.expiresAt ?? null,
      createdById: overrides.createdById ?? null,
    },
    select: { id: true },
  });
}

async function seedActiveKeys(organizationId: string, howMany: number) {
  for (let index = 0; index < howMany; index += 1) {
    await seedKey(organizationId);
  }
}

beforeEach(async () => {
  await resetDatabase();
  currentSession.value = null;
  counter = 0;
  const alice = await createUser({ email: "alice@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  const carol = await createUser({ email: "carol@a.example" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [
      { userId: alice.id, role: "owner" },
      { userId: carol.id, role: "member" },
    ],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "owner" }],
  });
  world = { alice, bob, carol, orgA, orgB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("klucze API na prawdziwej bazie", () => {
  it("create zapisuje hash HMAC-SHA256 z pieprzem, bez plaintextu, w organizacji aktywnej", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result.success).toBe(true);
    const plaintext = result.data?.plaintext ?? "";
    expect(plaintext).toMatch(/_live_/);
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: result.data?.id ?? "" },
    });
    expect(row.organizationId).toBe(world.orgA.id);
    expect(row.createdById).toBe(world.alice.id);
    expect(row.hashedKey).toBe(
      createHmac("sha256", process.env.API_KEY_PEPPER ?? "")
        .update(plaintext)
        .digest("hex"),
    );
    expect(row.displayPrefix).toBe(
      plaintext.slice(0, row.displayPrefix.length),
    );
    expect(row.displayPrefix).not.toBe(plaintext);
    expect(JSON.stringify(row)).not.toContain(plaintext);
    expect(row.revokedAt).toBeNull();
    expect(row.expiresAt).toBeNull();
  });

  it("create z expiresInDays 30 ustawia expiresAt około 30 dni w przód", async () => {
    await signInAs(world.alice, world.orgA);
    const before = Date.now();

    const result = await createApiKeyCommand({
      ...VALID_INPUT,
      expiresInDays: 30,
    });

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: result.data?.id ?? "" },
    });
    const expected = before + 30 * DAY_MS;
    expect(Math.abs((row.expiresAt?.getTime() ?? 0) - expected)).toBeLessThan(
      60_000,
    );
  });

  it("create przy 10 aktywnych kluczach zwraca błąd limitu i nie dodaje wiersza", async () => {
    await seedActiveKeys(world.orgA.id, 10);
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result).toEqual({
      success: false,
      error: "Osiągnięto limit 10 aktywnych kluczy",
    });
    expect(
      await prisma.apiKey.count({ where: { organizationId: world.orgA.id } }),
    ).toBe(10);
  });

  it("create przy 9 aktywnych kluczach tworzy dziesiąty", async () => {
    await seedActiveKeys(world.orgA.id, 9);
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(
      await prisma.apiKey.count({ where: { organizationId: world.orgA.id } }),
    ).toBe(10);
  });

  it("unieważnione i wygasłe klucze nie liczą się do limitu", async () => {
    await seedActiveKeys(world.orgA.id, 9);
    await seedKey(world.orgA.id, { revokedAt: YESTERDAY });
    await seedKey(world.orgA.id, { revokedAt: YESTERDAY });
    await seedKey(world.orgA.id, { expiresAt: YESTERDAY });
    await seedKey(world.orgA.id, { expiresAt: YESTERDAY });
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result.success).toBe(true);
  });

  it("klucz z terminem w przyszłości liczy się do limitu", async () => {
    await seedActiveKeys(world.orgA.id, 9);
    await seedKey(world.orgA.id, { expiresAt: IN_A_MONTH });
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result.success).toBe(false);
  });

  it("klucze innej organizacji nie liczą się do limitu", async () => {
    await seedActiveKeys(world.orgB.id, 10);
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result.success).toBe(true);
  });

  it("revoke ustawia revokedAt dla klucza własnej organizacji", async () => {
    const key = await seedKey(world.orgA.id);
    await signInAs(world.alice, world.orgA);

    const result = await revokeApiKeyCommand({ id: key.id });

    expect(result.success).toBe(true);
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    expect(row.revokedAt).not.toBeNull();
  });

  it("revoke klucza organizacji B z kontekstu A zwraca błąd i nie rusza klucza B", async () => {
    const keyB = await seedKey(world.orgB.id);
    await signInAs(world.alice, world.orgA);

    const result = await revokeApiKeyCommand({ id: keyB.id });

    expect(result.success).toBe(false);
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: keyB.id },
    });
    expect(row.revokedAt).toBeNull();
  });

  it("revoke nie nadpisuje revokedAt już unieważnionego klucza", async () => {
    const revokedAt = new Date("2026-01-15T10:00:00.000Z");
    const key = await seedKey(world.orgA.id, { revokedAt });
    await signInAs(world.alice, world.orgA);

    await revokeApiKeyCommand({ id: key.id });

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    expect(row.revokedAt?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("podwójne revoke zostawia pierwszy znacznik czasu", async () => {
    const key = await seedKey(world.orgA.id);
    await signInAs(world.alice, world.orgA);
    await revokeApiKeyCommand({ id: key.id });
    const first = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await revokeApiKeyCommand({ id: key.id });

    const second = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    expect(second.revokedAt?.getTime()).toBe(first.revokedAt?.getTime());
  });

  it("revoke nieistniejącego klucza zwraca błąd", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await revokeApiKeyCommand({
      id: "00000000-0000-4000-8000-000000000000",
    });

    expect(result.success).toBe(false);
  });

  it("delete usuwa klucz własnej organizacji", async () => {
    const key = await seedKey(world.orgA.id);
    await signInAs(world.alice, world.orgA);

    const result = await deleteApiKeyCommand({ id: key.id });

    expect(result.success).toBe(true);
    expect(
      await prisma.apiKey.findUnique({ where: { id: key.id } }),
    ).toBeNull();
  });

  it("delete klucza organizacji B z kontekstu A zwraca błąd i zostawia klucz B", async () => {
    const keyB = await seedKey(world.orgB.id);
    await signInAs(world.alice, world.orgA);

    const result = await deleteApiKeyCommand({ id: keyB.id });

    expect(result.success).toBe(false);
    expect(
      await prisma.apiKey.findUnique({ where: { id: keyB.id } }),
    ).not.toBeNull();
  });

  it("member nie unieważnia ani nie usuwa kluczy własnej organizacji", async () => {
    const key = await seedKey(world.orgA.id);
    await signInAs(world.carol, world.orgA);

    await expect(revokeApiKeyCommand({ id: key.id })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(deleteApiKeyCommand({ id: key.id })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    expect(row.revokedAt).toBeNull();
  });

  it("member nie tworzy ani nie listuje kluczy", async () => {
    await signInAs(world.carol, world.orgA);

    await expect(createApiKeyCommand(VALID_INPUT)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(listApiKeysQuery()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(await prisma.apiKey.count()).toBe(0);
  });

  it("listApiKeysQuery zwraca tylko klucze aktywnej organizacji", async () => {
    await seedKey(world.orgA.id, { name: "klucz A" });
    await seedKey(world.orgB.id, { name: "klucz B" });
    await signInAs(world.alice, world.orgA);

    const rows = await listApiKeysQuery();

    expect(rows.map((row) => row.name)).toEqual(["klucz A"]);
  });

  it("listApiKeysQuery z kontekstu B nie widzi kluczy A", async () => {
    await seedKey(world.orgA.id, { name: "klucz A" });
    await seedKey(world.orgB.id, { name: "klucz B" });
    await signInAs(world.bob, world.orgB);

    const rows = await listApiKeysQuery();

    expect(rows.map((row) => row.name)).toEqual(["klucz B"]);
  });

  it("listApiKeysQuery nie ujawnia hashedKey i zwraca autora", async () => {
    await seedKey(world.orgA.id, {
      name: "klucz A",
      createdById: world.alice.id,
    });
    await signInAs(world.alice, world.orgA);

    const rows = await listApiKeysQuery();

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "createdAt",
      "createdBy",
      "displayPrefix",
      "expiresAt",
      "id",
      "lastUsedAt",
      "name",
      "revokedAt",
      "scopes",
    ]);
    expect(rows[0]?.createdBy).toEqual({ id: world.alice.id, name: "alice" });
    expect(rows[0]?.displayPrefix).toBe("pfx_1");
    expect(rows[0]?.scopes).toEqual(["organization:read"]);
  });

  it("listApiKeysQuery zwraca createdBy null, gdy autor został usunięty", async () => {
    await seedKey(world.orgA.id, { createdById: null });
    await signInAs(world.alice, world.orgA);

    const rows = await listApiKeysQuery();

    expect(rows[0]?.createdBy).toBeNull();
  });

  it("listApiKeysQuery zawiera klucze unieważnione i wygasłe", async () => {
    await seedKey(world.orgA.id, {
      name: "unieważniony",
      revokedAt: YESTERDAY,
    });
    await seedKey(world.orgA.id, { name: "wygasły", expiresAt: YESTERDAY });
    await signInAs(world.alice, world.orgA);

    const rows = await listApiKeysQuery();

    expect(rows.map((row) => row.name).sort()).toEqual([
      "unieważniony",
      "wygasły",
    ]);
  });
});
