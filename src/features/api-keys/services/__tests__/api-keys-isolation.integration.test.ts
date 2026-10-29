import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { currentSession, mockTrackAudit } = vi.hoisted(() => ({
  mockTrackAudit: vi.fn(),
  currentSession: {
    value: null as null | {
      user: { id: string; role: string };
      session: { id: string; activeOrganizationId: string | null };
    },
  },
}));

vi.mock("@/shared/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/audit")>()),
  trackAudit: (event: unknown) => mockTrackAudit(event),
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

import { auth } from "@/shared/lib/auth";
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
  role = "user",
): Promise<void> {
  const session = await createSession({
    userId: user.id,
    activeOrganizationId: organization.id,
  });
  currentSession.value = {
    user: { id: user.id, role },
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
    createdAt?: Date;
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
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
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
  vi.spyOn(auth.api, "getSession").mockImplementation(
    (async () => currentSession.value) as never,
  );
  await resetDatabase();
  currentSession.value = null;
  counter = 0;
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
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
  it("create zapisuje audyt z entityType api_key i entityId nowego klucza", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit.mock.calls[0]?.[0]).toMatchObject({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "api_key.created",
      entityType: "api_key",
      entityId: result.data?.id,
    });
    const newData = mockTrackAudit.mock.calls[0]?.[0].newData;
    expect(Object.keys(newData).sort()).toEqual([
      "displayPrefix",
      "name",
      "scopes",
    ]);
    expect(newData.name).toBe("Nowy klucz");
    expect(newData.scopes).toEqual(["organization:read"]);
  });

  it("revoke zwraca sukces, ustawia revokedAt i zapisuje jeden audyt bez klucza i hasha", async () => {
    const key = await seedKey(world.orgA.id, { name: "do unieważnienia" });
    await signInAs(world.alice, world.orgA);

    const result = await revokeApiKeyCommand({ id: key.id });

    expect(result).toEqual({ success: true });
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    expect(row.revokedAt).not.toBeNull();
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    const event = mockTrackAudit.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "api_key.revoked",
      entityType: "api_key",
      entityId: key.id,
      oldData: { name: "do unieważnienia", displayPrefix: "pfx_1" },
    });
    expect(JSON.stringify(event)).not.toContain("hash-1");
  });

  it("drugie revoke tego samego klucza nie zmienia revokedAt i nie pisze drugiego audytu", async () => {
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
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
  });

  it("revoke już unieważnionego klucza nie pisze audytu", async () => {
    const key = await seedKey(world.orgA.id, { revokedAt: YESTERDAY });
    await signInAs(world.alice, world.orgA);

    await revokeApiKeyCommand({ id: key.id });

    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("delete zwraca sukces, usuwa rekord i zapisuje audyt api_key.deleted", async () => {
    const key = await seedKey(world.orgA.id, { name: "do usunięcia" });
    await signInAs(world.alice, world.orgA);

    const result = await deleteApiKeyCommand({ id: key.id });

    expect(result).toEqual({ success: true });
    expect(
      await prisma.apiKey.findUnique({ where: { id: key.id } }),
    ).toBeNull();
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    const event = mockTrackAudit.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      organizationId: world.orgA.id,
      action: "api_key.deleted",
      entityType: "api_key",
      entityId: key.id,
      oldData: { name: "do usunięcia", displayPrefix: "pfx_1" },
    });
    expect(JSON.stringify(event)).not.toContain("hash-1");
  });

  it("delete nieistniejącego id zwraca błąd bez audytu", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await deleteApiKeyCommand({
      id: "00000000-0000-4000-8000-000000000000",
    });

    expect(result.success).toBe(false);
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("revoke nieistniejącego id nie pisze audytu", async () => {
    await signInAs(world.alice, world.orgA);

    await revokeApiKeyCommand({ id: "00000000-0000-4000-8000-000000000000" });

    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("revoke i delete klucza B o tej samej nazwie z kontekstu A zwracają błąd, nie ruszają B i nie piszą audytu", async () => {
    await seedKey(world.orgA.id, { name: "wspólna" });
    const keyB = await seedKey(world.orgB.id, { name: "wspólna" });
    await signInAs(world.alice, world.orgA);

    const revoked = await revokeApiKeyCommand({ id: keyB.id });
    const deleted = await deleteApiKeyCommand({ id: keyB.id });

    expect(revoked.success).toBe(false);
    expect(deleted.success).toBe(false);
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: keyB.id },
    });
    expect(row.revokedAt).toBeNull();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("listApiKeysQuery zwraca klucze od najnowszego", async () => {
    await seedKey(world.orgA.id, {
      name: "środkowy",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    await seedKey(world.orgA.id, {
      name: "najnowszy",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    await seedKey(world.orgA.id, {
      name: "najstarszy",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await signInAs(world.alice, world.orgA);

    const rows = await listApiKeysQuery();

    expect(rows.map((row) => row.name)).toEqual([
      "najnowszy",
      "środkowy",
      "najstarszy",
    ]);
  });

  it("dwa równoległe create przy 9 aktywnych kluczach dają dokładnie jeden sukces i 10 aktywnych", async () => {
    await seedActiveKeys(world.orgA.id, 9);
    await signInAs(world.alice, world.orgA);

    const results = await Promise.all([
      createApiKeyCommand(VALID_INPUT),
      createApiKeyCommand(VALID_INPUT),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(
      await prisma.apiKey.count({
        where: { organizationId: world.orgA.id, revokedAt: null },
      }),
    ).toBe(10);
  });

  it("tryb serwisowy: revoke bez potwierdzenia zwraca błąd, nie zmienia klucza i nie pisze audytu", async () => {
    const key = await seedKey(world.orgA.id);
    const superadmin = await createUser({
      email: "super@wa.example",
      role: "superadmin",
    });
    await signInAs(superadmin, world.orgA, "superadmin");

    const result = await revokeApiKeyCommand({ id: key.id });

    expect(result).toEqual({
      success: false,
      error: "Potwierdź zmianę w trybie serwisowym",
    });
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    expect(row.revokedAt).toBeNull();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("tryb serwisowy: delete bez potwierdzenia zwraca błąd, zostawia klucz i nie pisze audytu", async () => {
    const key = await seedKey(world.orgA.id);
    const superadmin = await createUser({
      email: "super@wa.example",
      role: "superadmin",
    });
    await signInAs(superadmin, world.orgA, "superadmin");

    const result = await deleteApiKeyCommand({ id: key.id });

    expect(result).toEqual({
      success: false,
      error: "Potwierdź zmianę w trybie serwisowym",
    });
    expect(
      await prisma.apiKey.findUnique({ where: { id: key.id } }),
    ).not.toBeNull();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("tryb serwisowy: create bez potwierdzenia nie dodaje wiersza", async () => {
    const superadmin = await createUser({
      email: "super@wa.example",
      role: "superadmin",
    });
    await signInAs(superadmin, world.orgA, "superadmin");

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(await prisma.apiKey.count()).toBe(0);
  });

  it("tryb serwisowy: revoke z potwierdzeniem aktywnej organizacji działa i oznacza audyt serviceMode", async () => {
    const key = await seedKey(world.orgA.id);
    const superadmin = await createUser({
      email: "super@wa.example",
      role: "superadmin",
    });
    await signInAs(superadmin, world.orgA, "superadmin");

    const result = await revokeApiKeyCommand(
      { id: key.id },
      { serviceModeConfirmed: true, organizationId: world.orgA.id },
    );

    expect(result).toEqual({ success: true });
    expect(mockTrackAudit.mock.calls[0]?.[0]).toMatchObject({
      action: "api_key.revoked",
      serviceMode: true,
    });
  });
});
