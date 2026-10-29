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
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";
import { getEntityAuditTrailQuery } from "../audit-trail-query";

interface World {
  alice: { id: string };
  bob: { id: string };
  carol: { id: string };
  dave: { id: string };
  orgA: { id: string };
  orgB: { id: string };
}

let world: World;

async function signInAs(
  user: { id: string },
  organization: { id: string },
  role = "user",
) {
  const session = await createSession({
    userId: user.id,
    activeOrganizationId: organization.id,
  });
  currentSession.value = {
    user: { id: user.id, role },
    session: { id: session.id, activeOrganizationId: organization.id },
  };
}

async function seed(input: {
  organizationId: string;
  action?: string;
  entityType?: string;
  entityId?: string | null;
  createdAt?: Date;
  userId?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      action: input.action ?? "member.invited",
      entityType: input.entityType ?? "delivery",
      entityId: input.entityId === undefined ? "123" : input.entityId,
      createdAt: input.createdAt,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  currentSession.value = null;
  const alice = await createUser({ email: "alice@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  const carol = await createUser({ email: "carol@a.example" });
  const dave = await createUser({ email: "dave@a.example" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [
      { userId: alice.id, role: "owner" },
      { userId: carol.id, role: "member" },
      { userId: dave.id, role: "admin" },
    ],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "owner" }],
  });
  world = { alice, bob, carol, dave, orgA, orgB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getEntityAuditTrailQuery na prawdziwej bazie", () => {
  it("owner A widzi 3 wpisy A od najnowszego i nie widzi wpisu B o tym samym entityId", async () => {
    await seed({
      organizationId: world.orgA.id,
      action: "member.invited",
      createdAt: new Date("2026-03-01T10:00:00Z"),
    });
    await seed({
      organizationId: world.orgA.id,
      action: "member.removed",
      createdAt: new Date("2026-03-03T10:00:00Z"),
    });
    await seed({
      organizationId: world.orgA.id,
      action: "member.role_changed",
      createdAt: new Date("2026-03-02T10:00:00Z"),
    });
    await seed({
      organizationId: world.orgB.id,
      action: "invitation.canceled",
      createdAt: new Date("2026-03-04T10:00:00Z"),
    });
    await signInAs(world.alice, world.orgA);

    const rows = await getEntityAuditTrailQuery("delivery", "123");

    expect(rows?.map((row) => row.action)).toEqual([
      "member.removed",
      "member.role_changed",
      "member.invited",
    ]);
  });

  it("owner B widzi wyłącznie wpis B", async () => {
    await seed({ organizationId: world.orgA.id, action: "member.removed" });
    await seed({
      organizationId: world.orgB.id,
      action: "invitation.canceled",
    });
    await signInAs(world.bob, world.orgB);

    const rows = await getEntityAuditTrailQuery("delivery", "123");

    expect(rows?.map((row) => row.action)).toEqual(["invitation.canceled"]);
  });

  it("admin organizacji ma dostęp", async () => {
    await seed({ organizationId: world.orgA.id });
    await signInAs(world.dave, world.orgA);

    const rows = await getEntityAuditTrailQuery("delivery", "123");

    expect(rows).toHaveLength(1);
  });

  it("zwraca 50 najnowszych z 60 wpisów, od najnowszego", async () => {
    for (let index = 0; index < 60; index += 1) {
      await seed({
        organizationId: world.orgA.id,
        action: `step.${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      });
    }
    await signInAs(world.alice, world.orgA);

    const rows = await getEntityAuditTrailQuery("delivery", "123");

    expect(rows).toHaveLength(50);
    expect(rows?.[0].action).toBe("step.59");
    expect(rows?.[49].action).toBe("step.10");
  });

  it("member dostaje null i nie pyta o wiersze", async () => {
    await seed({ organizationId: world.orgA.id });
    await signInAs(world.carol, world.orgA);
    const findMany = vi.spyOn(prisma.auditLog, "findMany");

    const rows = await getEntityAuditTrailQuery("delivery", "123");

    expect(rows).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
    findMany.mockRestore();
  });

  it("brak wpisów daje pustą tablicę", async () => {
    await signInAs(world.alice, world.orgA);

    const rows = await getEntityAuditTrailQuery("delivery", "999");

    expect(rows).toEqual([]);
  });

  it("filtruje po entityType i entityId", async () => {
    await seed({ organizationId: world.orgA.id, action: "x.same" });
    await seed({
      organizationId: world.orgA.id,
      entityType: "invoice",
      action: "x.other_type",
    });
    await seed({
      organizationId: world.orgA.id,
      entityId: "124",
      action: "x.other_id",
    });
    await seed({
      organizationId: world.orgA.id,
      entityId: null,
      action: "x.no_id",
    });
    await signInAs(world.alice, world.orgA);

    const rows = await getEntityAuditTrailQuery("delivery", "123");

    expect(rows?.map((row) => row.action)).toEqual(["x.same"]);
  });

  it("zwraca autora wpisu", async () => {
    await seed({ organizationId: world.orgA.id, userId: world.alice.id });
    await signInAs(world.alice, world.orgA);

    const rows = await getEntityAuditTrailQuery("delivery", "123");

    expect(rows?.[0].actor).toEqual({
      id: world.alice.id,
      name: expect.any(String),
      email: "alice@a.example",
    });
  });

  it("bez sesji nic nie zwraca i rzuca", async () => {
    await seed({ organizationId: world.orgA.id });

    await expect(getEntityAuditTrailQuery("delivery", "123")).rejects.toThrow();
  });
});
