import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/prisma";
import {
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";
import { writeAuditLog } from "../write-audit-log";

let world: {
  alice: { id: string };
  bob: { id: string };
  orgA: { id: string };
  orgB: { id: string };
};

beforeEach(async () => {
  await resetDatabase();
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

describe("writeAuditLog na prawdziwej bazie", () => {
  it("zapisuje wiersz w organizacji z zdarzenia, a organizacja B go nie widzi", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "member.invited",
      entityType: "invitation",
      entityId: "inv-1",
    });

    const rowsA = await prisma.auditLog.findMany({
      where: { organizationId: world.orgA.id },
    });
    const rowsB = await prisma.auditLog.findMany({
      where: { organizationId: world.orgB.id },
    });
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({
      organizationId: world.orgA.id,
      userId: world.alice.id,
      action: "member.invited",
      entityType: "invitation",
      entityId: "inv-1",
    });
    expect(rowsB).toEqual([]);
  });

  it("zapisy dla dwóch organizacji nie mieszają się", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "a.action",
      entityType: "x",
    });
    await writeAuditLog({
      organizationId: world.orgB.id,
      actorUserId: world.bob.id,
      action: "b.action",
      entityType: "x",
    });

    const rowsA = await prisma.auditLog.findMany({
      where: { organizationId: world.orgA.id },
    });
    const rowsB = await prisma.auditLog.findMany({
      where: { organizationId: world.orgB.id },
    });
    expect(rowsA.map((row) => row.action)).toEqual(["a.action"]);
    expect(rowsB.map((row) => row.action)).toEqual(["b.action"]);
  });

  it("domyślnie zapisuje channel WEB, serviceMode false i brak danych", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "organization.entered",
      entityType: "organization",
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: world.orgA.id },
    });
    expect(row).toMatchObject({
      channel: "WEB",
      serviceMode: false,
      credentialId: null,
      entityId: null,
      oldData: null,
      newData: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("zachowuje jawnie podane channel API, credentialId i serviceMode", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: null,
      action: "x.y",
      entityType: "x",
      channel: "API",
      credentialId: "cred-1",
      serviceMode: true,
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: world.orgA.id },
    });
    expect(row).toMatchObject({
      userId: null,
      channel: "API",
      credentialId: "cred-1",
      serviceMode: true,
    });
  });

  it("redaguje oldData.password przed zapisem", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "user.updated",
      entityType: "user",
      oldData: { name: "A", password: "hunter2" },
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: world.orgA.id },
    });
    expect(row.oldData).toEqual({ name: "A", password: "[REDACTED]" });
  });

  it("redaguje newData przed zapisem, także w tablicy", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "key.created",
      entityType: "api_key",
      newData: { keys: [{ apiKey: "sk-1", id: 1 }], Authorization: "Bearer z" },
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: world.orgA.id },
    });
    expect(row.newData).toEqual({
      keys: [{ apiKey: "[REDACTED]", id: 1 }],
      Authorization: "[REDACTED]",
    });
  });

  it("oldData i newData ustawione na null zapisują się jako NULL w bazie", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "x.y",
      entityType: "x",
      oldData: null,
      newData: null,
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: world.orgA.id },
    });
    expect(row.oldData).toBeNull();
    expect(row.newData).toBeNull();
  });

  it("newData null przy niepustym oldData zachowuje oldData i zapisuje NULL w newData", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "x.deleted",
      entityType: "x",
      oldData: { name: "A", password: "p" },
      newData: null,
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: world.orgA.id },
    });
    expect(row.oldData).toEqual({ name: "A", password: "[REDACTED]" });
    expect(row.newData).toBeNull();
  });

  it("usunięcie użytkownika zostawia wiersz z userId null", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "member.removed",
      entityType: "member",
    });

    await prisma.user.delete({ where: { id: world.alice.id } });

    const rows = await prisma.auditLog.findMany({
      where: { organizationId: world.orgA.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBeNull();
  });

  it("usunięcie organizacji usuwa jej wiersze i zostawia cudze", async () => {
    await writeAuditLog({
      organizationId: world.orgA.id,
      actorUserId: world.alice.id,
      action: "a.action",
      entityType: "x",
    });
    await writeAuditLog({
      organizationId: world.orgB.id,
      actorUserId: world.bob.id,
      action: "b.action",
      entityType: "x",
    });

    await prisma.organization.delete({ where: { id: world.orgA.id } });

    const rows = await prisma.auditLog.findMany();
    expect(rows.map((row) => row.action)).toEqual(["b.action"]);
  });

  it("zapis dla nieistniejącej organizacji rzuca błąd i nic nie zapisuje", async () => {
    await expect(
      writeAuditLog({
        organizationId: "nie-istnieje",
        actorUserId: world.alice.id,
        action: "x.y",
        entityType: "x",
      }),
    ).rejects.toThrow();

    await expect(prisma.auditLog.count()).resolves.toBe(0);
  });
});
