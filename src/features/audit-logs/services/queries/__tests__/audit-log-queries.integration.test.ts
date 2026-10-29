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
import {
  listAuditLogActorsQuery,
  listAuditLogsQuery,
} from "../audit-log-queries";

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
  id?: string;
  organizationId: string;
  userId?: string | null;
  action?: string;
  entityType?: string;
  entityId?: string | null;
  createdAt?: Date;
}) {
  await prisma.auditLog.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      action: input.action ?? "member.invited",
      entityType: input.entityType ?? "member",
      entityId: input.entityId ?? null,
      createdAt: input.createdAt,
    },
  });
}

async function seedSequence(organizationId: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await seed({
      organizationId,
      entityId: String(index).padStart(2, "0"),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    });
  }
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

describe("listAuditLogsQuery na prawdziwej bazie", () => {
  it("owner organizacji A widzi tylko wiersze A", async () => {
    await seed({ organizationId: world.orgA.id, entityId: "a1" });
    await seed({ organizationId: world.orgA.id, entityId: "a2" });
    await seed({ organizationId: world.orgB.id, entityId: "b1" });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({});

    expect(result.items.map((row) => row.entityId).sort()).toEqual([
      "a1",
      "a2",
    ]);
    expect(result.totalItems).toBe(2);
  });

  it("owner organizacji B nie widzi wierszy A", async () => {
    await seed({ organizationId: world.orgA.id, entityId: "a1" });
    await seed({ organizationId: world.orgB.id, entityId: "b1" });
    await signInAs(world.bob, world.orgB);

    const result = await listAuditLogsQuery({});

    expect(result.items.map((row) => row.entityId)).toEqual(["b1"]);
    expect(result.totalItems).toBe(1);
  });

  it("admin organizacji ma dostęp", async () => {
    await seed({ organizationId: world.orgA.id, entityId: "a1" });
    await signInAs(world.dave, world.orgA);

    const result = await listAuditLogsQuery({});

    expect(result.items).toHaveLength(1);
  });

  it("member dostaje NEXT_NOT_FOUND i nie pyta o wiersze", async () => {
    await seed({ organizationId: world.orgA.id, entityId: "a1" });
    await signInAs(world.carol, world.orgA);
    const findMany = vi.spyOn(prisma.auditLog, "findMany");
    const count = vi.spyOn(prisma.auditLog, "count");

    await expect(listAuditLogsQuery({})).rejects.toThrow("NEXT_NOT_FOUND");

    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    findMany.mockRestore();
    count.mockRestore();
  });

  it("bez sesji kończy się przekierowaniem lub błędem i nic nie zwraca", async () => {
    await seed({ organizationId: world.orgA.id, entityId: "a1" });

    await expect(listAuditLogsQuery({})).rejects.toThrow();
  });

  it("filtr entityType i entityId zwraca wyłącznie wpisy tej rzeczy", async () => {
    await seed({
      organizationId: world.orgA.id,
      entityType: "delivery",
      entityId: "123",
    });
    await seed({
      organizationId: world.orgA.id,
      entityType: "delivery",
      entityId: "124",
    });
    await seed({
      organizationId: world.orgA.id,
      entityType: "invoice",
      entityId: "123",
    });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({
      entityType: "delivery",
      entityId: "123",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      entityType: "delivery",
      entityId: "123",
    });
    expect(result.totalItems).toBe(1);
  });

  it("filtr samego entityId pomija wpisy innych identyfikatorów", async () => {
    await seed({ organizationId: world.orgA.id, entityId: "123" });
    await seed({ organizationId: world.orgA.id, entityId: "999" });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ entityId: "123" });

    expect(result.items.map((row) => row.entityId)).toEqual(["123"]);
  });

  it("filtr action zwraca tylko tę akcję", async () => {
    await seed({ organizationId: world.orgA.id, action: "member.invited" });
    await seed({ organizationId: world.orgA.id, action: "member.removed" });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ action: "member.removed" });

    expect(result.items.map((row) => row.action)).toEqual(["member.removed"]);
  });

  it("filtr userId zwraca wyłącznie wpisy tej osoby", async () => {
    await seed({
      organizationId: world.orgA.id,
      userId: world.alice.id,
      entityId: "by-alice",
    });
    await seed({
      organizationId: world.orgA.id,
      userId: world.carol.id,
      entityId: "by-carol",
    });
    await seed({ organizationId: world.orgA.id, entityId: "by-nobody" });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ userId: world.carol.id });

    expect(result.items.map((row) => row.entityId)).toEqual(["by-carol"]);
  });

  it("filtr userId cudzej organizacji nie zwraca jej wpisów", async () => {
    await seed({
      organizationId: world.orgB.id,
      userId: world.bob.id,
      entityId: "b1",
    });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ userId: world.bob.id });

    expect(result.items).toEqual([]);
    expect(result.totalItems).toBe(0);
  });

  it("filtry from i to obejmują końce zakresu włącznie", async () => {
    await seed({
      organizationId: world.orgA.id,
      entityId: "before",
      createdAt: new Date("2026-10-28T23:59:59.999Z"),
    });
    await seed({
      organizationId: world.orgA.id,
      entityId: "start",
      createdAt: new Date("2026-10-29T00:00:00.000Z"),
    });
    await seed({
      organizationId: world.orgA.id,
      entityId: "end",
      createdAt: new Date("2026-10-29T23:59:59.999Z"),
    });
    await seed({
      organizationId: world.orgA.id,
      entityId: "after",
      createdAt: new Date("2026-10-30T00:00:00.000Z"),
    });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({
      from: "2026-10-29",
      to: "2026-10-29",
    });

    expect(result.items.map((row) => row.entityId).sort()).toEqual([
      "end",
      "start",
    ]);
  });

  it("30 wierszy przy pageSize 25 daje totalPages 2 i 25 wierszy na stronie 1", async () => {
    await seedSequence(world.orgA.id, 30);
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ pageSize: 25 });

    expect(result.totalItems).toBe(30);
    expect(result.totalPages).toBe(2);
    expect(result.currentPage).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.items).toHaveLength(25);
  });

  it("strona 2 zawiera pozostałe 5 wierszy", async () => {
    await seedSequence(world.orgA.id, 30);
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ pageSize: 25, page: 2 });

    expect(result.items).toHaveLength(5);
    expect(result.currentPage).toBe(2);
  });

  it("domyślnie sortuje malejąco po createdAt", async () => {
    await seedSequence(world.orgA.id, 3);
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({});

    expect(result.items.map((row) => row.entityId)).toEqual(["02", "01", "00"]);
  });

  it("sortDir asc odwraca kolejność", async () => {
    await seedSequence(world.orgA.id, 3);
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ sortDir: "asc" });

    expect(result.items.map((row) => row.entityId)).toEqual(["00", "01", "02"]);
  });

  it("sortBy action porządkuje po akcji", async () => {
    await seed({ organizationId: world.orgA.id, action: "b.x", entityId: "2" });
    await seed({ organizationId: world.orgA.id, action: "a.x", entityId: "1" });
    await seed({ organizationId: world.orgA.id, action: "c.x", entityId: "3" });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({
      sortBy: "action",
      sortDir: "asc",
    });

    expect(result.items.map((row) => row.action)).toEqual([
      "a.x",
      "b.x",
      "c.x",
    ]);
  });

  it("strona 2 przy pageSize 10 sortowana rosnąco zaczyna od wiersza 10", async () => {
    await seedSequence(world.orgA.id, 25);
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({
      pageSize: 10,
      page: 2,
      sortDir: "asc",
    });

    expect(result.items.map((row) => row.entityId)).toEqual([
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
    ]);
    expect(result.totalPages).toBe(3);
  });

  it("strona 1 przy pageSize 10 sortowana rosnąco zaczyna od pierwszego wiersza", async () => {
    await seedSequence(world.orgA.id, 25);
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ pageSize: 10, sortDir: "asc" });

    expect(result.items[0]?.entityId).toBe("00");
    expect(result.items[9]?.entityId).toBe("09");
  });

  it("błędne wartości filtrów dają domyślne bez wyjątku", async () => {
    await seedSequence(world.orgA.id, 3);
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({
      page: "-1",
      pageSize: "1000",
      from: "abc",
    });

    expect(result.currentPage).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.items).toHaveLength(3);
  });

  it("zwraca autora, kanał, tryb serwisowy i dane wiersza", async () => {
    await prisma.auditLog.create({
      data: {
        organizationId: world.orgA.id,
        userId: world.carol.id,
        action: "member.invited",
        entityType: "member",
        entityId: "m1",
        newData: { role: "admin" },
        channel: "API",
        serviceMode: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: world.orgA.id,
        userId: null,
        action: "system.tick",
        entityType: "system",
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({});

    expect(result.items[0]).toMatchObject({
      action: "member.invited",
      entityId: "m1",
      actor: { id: world.carol.id, name: "carol", email: "carol@a.example" },
      newData: { role: "admin" },
      oldData: null,
      channel: "API",
      serviceMode: true,
    });
    expect(result.items[1]?.actor).toBeNull();
  });
});

describe("listAuditLogActorsQuery na prawdziwej bazie", () => {
  it("zwraca tylko użytkowników z wpisami w aktywnej organizacji", async () => {
    await seed({ organizationId: world.orgA.id, userId: world.alice.id });
    await seed({ organizationId: world.orgA.id, userId: world.alice.id });
    await seed({ organizationId: world.orgA.id, userId: world.carol.id });
    await seed({ organizationId: world.orgA.id, userId: null });
    await seed({ organizationId: world.orgB.id, userId: world.bob.id });
    await signInAs(world.alice, world.orgA);

    const actors = await listAuditLogActorsQuery();

    expect(actors).toHaveLength(2);
    expect(actors).toEqual(
      expect.arrayContaining([
        { id: world.alice.id, name: "alice" },
        { id: world.carol.id, name: "carol" },
      ]),
    );
  });

  it("organizacja B widzi tylko swoich autorów", async () => {
    await seed({ organizationId: world.orgA.id, userId: world.alice.id });
    await seed({ organizationId: world.orgB.id, userId: world.bob.id });
    await signInAs(world.bob, world.orgB);

    const actors = await listAuditLogActorsQuery();

    expect(actors).toEqual([{ id: world.bob.id, name: "bob" }]);
  });

  it("member dostaje NEXT_NOT_FOUND", async () => {
    await seed({ organizationId: world.orgA.id, userId: world.alice.id });
    await signInAs(world.carol, world.orgA);

    await expect(listAuditLogActorsQuery()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("listAuditLogsQuery: zakresy, stabilność i kształt aktora", () => {
  async function seedDates() {
    for (const [entityId, iso] of [
      ["early", "2026-10-28T12:00:00.000Z"],
      ["mid", "2026-10-29T12:00:00.000Z"],
      ["late", "2026-10-30T12:00:00.000Z"],
    ] as const) {
      await seed({
        organizationId: world.orgA.id,
        entityId,
        createdAt: new Date(iso),
      });
    }
  }

  it("samo from filtruje od daty", async () => {
    await seedDates();
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ from: "2026-10-29" });

    expect(result.items.map((row) => row.entityId).sort()).toEqual([
      "late",
      "mid",
    ]);
  });

  it("samo to filtruje do daty", async () => {
    await seedDates();
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({ to: "2026-10-29" });

    expect(result.items.map((row) => row.entityId).sort()).toEqual([
      "early",
      "mid",
    ]);
  });

  it("wpisy o identycznym createdAt są w stałej kolejności po id rosnąco", async () => {
    const sameMoment = new Date("2026-10-29T12:00:00.000Z");
    for (const id of [
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]) {
      await seed({ id, organizationId: world.orgA.id, createdAt: sameMoment });
    }
    await signInAs(world.alice, world.orgA);

    const desc = await listAuditLogsQuery({});
    const asc = await listAuditLogsQuery({ sortDir: "asc" });

    const expected = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    expect(desc.items.map((row) => row.id)).toEqual(expected);
    expect(asc.items.map((row) => row.id)).toEqual(expected);
  });

  it("actor zawiera dokładnie id, name i email", async () => {
    await seed({ organizationId: world.orgA.id, userId: world.carol.id });
    await signInAs(world.alice, world.orgA);

    const result = await listAuditLogsQuery({});

    expect(result.items[0]?.actor).toEqual({
      id: world.carol.id,
      name: "carol",
      email: "carol@a.example",
    });
  });

  it("aktorzy są posortowani po name rosnąco", async () => {
    await seed({ organizationId: world.orgA.id, userId: world.dave.id });
    await seed({ organizationId: world.orgA.id, userId: world.carol.id });
    await seed({ organizationId: world.orgA.id, userId: world.alice.id });
    await signInAs(world.alice, world.orgA);

    const actors = await listAuditLogActorsQuery();

    expect(actors.map((actor) => actor.name)).toEqual([
      "alice",
      "carol",
      "dave",
    ]);
  });

  it("aktorzy utworzeni w kolejności niealfabetycznej wracają posortowani po name", async () => {
    const zofia = await createUser({ email: "zofia@a.example" });
    const adam = await createUser({ email: "adam@a.example" });
    const marek = await createUser({ email: "marek@a.example" });
    for (const user of [zofia, adam, marek]) {
      await seed({ organizationId: world.orgA.id, userId: user.id });
    }
    await signInAs(world.alice, world.orgA);

    const actors = await listAuditLogActorsQuery();

    expect(actors.map((actor) => actor.name)).toEqual([
      "adam",
      "marek",
      "zofia",
    ]);
  });
});
