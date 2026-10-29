import { createHmac } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prisma } from "@/shared/lib/prisma";
import { GET } from "@/app/api/v1/organization/route";
import {
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_A = "wa_app_live_keyForOrgA0001";
const KEY_B = "wa_app_live_keyForOrgB0002";

interface World {
  orgA: { id: string };
  orgB: { id: string };
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
  plaintext: string,
  overrides: {
    scopes?: string[];
    revokedAt?: Date | null;
    expiresAt?: Date | null;
  } = {},
): Promise<{ id: string }> {
  counter += 1;
  return prisma.apiKey.create({
    data: {
      organizationId,
      name: `klucz-${counter}`,
      displayPrefix: plaintext.slice(0, 18),
      hashedKey: hash(plaintext),
      scopes: overrides.scopes ?? ["organization:read"],
      revokedAt: overrides.revokedAt ?? null,
      expiresAt: overrides.expiresAt ?? null,
    },
    select: { id: true },
  });
}

function call(
  authorization: string | null,
  extra: Record<string, string> = {},
  query = "",
): Promise<Response> {
  const headers = new Headers(extra);
  if (authorization !== null) {
    headers.set("authorization", authorization);
  }
  return GET(
    new Request(`http://localhost/api/v1/organization${query}`, { headers }),
  );
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
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "owner" }],
  });
  world = { orgA, orgB };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/organization", () => {
  it("klucz organizacji A zwraca 200 z danymi A", async () => {
    await seedKey(world.orgA.id, KEY_A);
    await seedKey(world.orgB.id, KEY_B);
    const response = await call(`Bearer ${KEY_A}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: world.orgA.id,
      name: "Org A",
      slug: "org-a",
    });
  });

  it("klucz organizacji B zwraca dane B, nigdy A", async () => {
    await seedKey(world.orgA.id, KEY_A);
    await seedKey(world.orgB.id, KEY_B);
    const response = await call(`Bearer ${KEY_B}`);
    await expect(response.json()).resolves.toEqual({
      id: world.orgB.id,
      name: "Org B",
      slug: "org-b",
    });
  });

  it("nagłówek i parametr z cudzym organizationId nie zmieniają organizacji", async () => {
    await seedKey(world.orgA.id, KEY_A);
    const response = await call(
      `Bearer ${KEY_A}`,
      { "x-organization-id": world.orgB.id },
      `?organizationId=${world.orgB.id}`,
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe(world.orgA.id);
  });

  it("bez nagłówka zwraca 401 z { error: missing }", async () => {
    const response = await call(null);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "missing" });
  });

  it("nieznany klucz zwraca 401 z { error: invalid }", async () => {
    await seedKey(world.orgA.id, KEY_A);
    const response = await call("Bearer wa_app_live_nope");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid" });
  });

  it("klucz z inną wielkością liter zwraca 401 invalid", async () => {
    await seedKey(world.orgA.id, KEY_A);
    const response = await call(`Bearer ${KEY_A.toUpperCase()}`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid" });
  });

  it("klucz z dopisaną spacją wewnątrz nagłówka zwraca 401 invalid", async () => {
    await seedKey(world.orgA.id, KEY_A);
    const response = await call(`Bearer ${KEY_A} x`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid" });
  });

  it("surowy klucz bez Bearer zwraca 401 bez wyjątku", async () => {
    await seedKey(world.orgA.id, KEY_A);
    const response = await call(KEY_A);
    expect(response.status).toBe(401);
  });

  it("odwołany klucz zwraca 401 revoked", async () => {
    await seedKey(world.orgA.id, KEY_A, {
      revokedAt: new Date(NOW.getTime() - DAY_MS),
    });
    const response = await call(`Bearer ${KEY_A}`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "revoked" });
  });

  it("wygasły klucz zwraca 401 expired", async () => {
    await seedKey(world.orgA.id, KEY_A, {
      expiresAt: new Date(NOW.getTime() - DAY_MS),
    });
    const response = await call(`Bearer ${KEY_A}`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "expired" });
  });

  it("klucz ważny jeszcze dobę zwraca 200", async () => {
    await seedKey(world.orgA.id, KEY_A, {
      expiresAt: new Date(NOW.getTime() + DAY_MS),
    });
    const response = await call(`Bearer ${KEY_A}`);
    expect(response.status).toBe(200);
  });

  it("klucz bez organization:read zwraca 403 scope", async () => {
    await seedKey(world.orgA.id, KEY_A, { scopes: ["audit:read"] });
    const response = await call(`Bearer ${KEY_A}`);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "scope" });
  });

  it("klucz z samym nieznanym scope'em zwraca 403 scope", async () => {
    await seedKey(world.orgA.id, KEY_A, { scopes: ["legacy:gone"] });
    const response = await call(`Bearer ${KEY_A}`);
    expect(response.status).toBe(403);
  });

  it("udane wywołanie ustawia lastUsedAt tylko temu kluczowi", async () => {
    const keyA = await seedKey(world.orgA.id, KEY_A);
    const keyB = await seedKey(world.orgB.id, KEY_B);
    await call(`Bearer ${KEY_A}`);
    await vi.waitFor(async () => {
      const row = await prisma.apiKey.findUniqueOrThrow({
        where: { id: keyA.id },
        select: { lastUsedAt: true },
      });
      expect(row.lastUsedAt?.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    });
    const untouched = await prisma.apiKey.findUniqueOrThrow({
      where: { id: keyB.id },
      select: { lastUsedAt: true },
    });
    expect(untouched.lastUsedAt).toBeNull();
  });

  it("nieudane uwierzytelnienie nie ustawia lastUsedAt", async () => {
    const key = await seedKey(world.orgA.id, KEY_A, { scopes: [] });
    await call(`Bearer ${KEY_A}`);
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
      select: { lastUsedAt: true },
    });
    expect(row.lastUsedAt).toBeNull();
  });
});
