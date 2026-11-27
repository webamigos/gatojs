import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredCommandHook } from "@/shared/lib/commands/define-command";

const { currentSession, mockTrackAudit, hookStore } = vi.hoisted(() => ({
  mockTrackAudit: vi.fn(),
  hookStore: { entries: [] as RegisteredCommandHook[] },
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
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => currentSession.value) } },
}));
vi.mock("@/modules.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.generated")>()),
  moduleCommandHooks: hookStore.entries,
}));

import { prisma } from "@/shared/lib/prisma";
import { withoutTenantScope } from "@/shared/lib/tenant-scope";
import {
  createApiKeyCommand,
  deleteApiKeyCommand,
  revokeApiKeyCommand,
} from "../commands/api-key-commands";
import {
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const VALID_INPUT = {
  name: "Nowy klucz",
  scopes: ["organization:read"],
  expiresInDays: null,
};

interface World {
  alice: { id: string };
  bob: { id: string };
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

async function seedKey(organizationId: string): Promise<{ id: string }> {
  counter += 1;
  return prisma.apiKey.create({
    data: {
      organizationId,
      name: `klucz-${counter}`,
      displayPrefix: `pfx_${counter}`,
      hashedKey: `hash-${counter}`,
      scopes: ["organization:read"],
    },
    select: { id: true },
  });
}

function addHook(
  command: string,
  before: RegisteredCommandHook["hook"]["before"],
): void {
  hookStore.entries.push({
    module: "api-keys",
    command,
    hook: { id: `api-keys.test-${command}`, before },
  });
}

async function keyOfOrgB(id: string) {
  return prisma.apiKey.findUnique({
    where: { id, organizationId: world.orgB.id },
    select: { id: true, revokedAt: true },
  });
}

beforeEach(async () => {
  await resetDatabase();
  hookStore.entries.length = 0;
  currentSession.value = null;
  counter = 0;
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
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
  world = { alice, bob, orgA, orgB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("api key command before hooks on the database", () => {
  it("a revoke hook returning org B's key id under org A's context fails and leaves org B's key active", async () => {
    const own = await seedKey(world.orgA.id);
    const foreign = await seedKey(world.orgB.id);
    addHook("api-keys.revoke", () => ({ id: foreign.id }));
    await signInAs(world.alice, world.orgA);

    const result = await revokeApiKeyCommand({ id: own.id });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expect(await keyOfOrgB(foreign.id)).toEqual({
      id: foreign.id,
      revokedAt: null,
    });
    const ownRow = await prisma.apiKey.findUniqueOrThrow({
      where: { id: own.id, organizationId: world.orgA.id },
    });
    expect(ownRow.revokedAt).toBeNull();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("a delete hook returning org B's key id under org A's context fails and keeps org B's key", async () => {
    const own = await seedKey(world.orgA.id);
    const foreign = await seedKey(world.orgB.id);
    addHook("api-keys.delete", () => ({ id: foreign.id }));
    await signInAs(world.alice, world.orgA);

    const result = await deleteApiKeyCommand({ id: own.id });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expect(await keyOfOrgB(foreign.id)).toEqual({
      id: foreign.id,
      revokedAt: null,
    });
    const ids = await withoutTenantScope("test assertion", () =>
      prisma.apiKey.findMany({ select: { id: true } }),
    );
    expect(ids.map((row) => row.id).sort()).toEqual(
      [own.id, foreign.id].sort(),
    );
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("a create hook adding org B's id creates the key in org A only", async () => {
    addHook("api-keys.create", (input) => ({
      ...input,
      organizationId: world.orgB.id,
    }));
    await signInAs(world.alice, world.orgA);

    const result = await createApiKeyCommand(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(
      await prisma.apiKey.count({ where: { organizationId: world.orgA.id } }),
    ).toBe(1);
    expect(
      await prisma.apiKey.count({ where: { organizationId: world.orgB.id } }),
    ).toBe(0);
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: result.data?.id ?? "", organizationId: world.orgA.id },
    });
    expect(row.name).toBe("Nowy klucz");
    expect(row.createdById).toBe(world.alice.id);
  });

  it("a revoke hook returning another key of org A revokes that key only", async () => {
    const requested = await seedKey(world.orgA.id);
    const target = await seedKey(world.orgA.id);
    addHook("api-keys.revoke", () => ({ id: target.id }));
    await signInAs(world.alice, world.orgA);

    const result = await revokeApiKeyCommand({ id: requested.id });

    expect(result).toEqual({ success: true });
    const rows = await prisma.apiKey.findMany({
      where: { organizationId: world.orgA.id },
      select: { id: true, revokedAt: true },
    });
    expect(rows.find((row) => row.id === requested.id)?.revokedAt).toBeNull();
    expect(rows.find((row) => row.id === target.id)?.revokedAt).toBeInstanceOf(
      Date,
    );
  });
});
