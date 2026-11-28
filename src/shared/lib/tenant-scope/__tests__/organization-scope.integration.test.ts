import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/prisma";
import {
  TenantScopeError,
  runInOrganizationScope,
  withoutTenantScope,
} from "@/shared/lib/tenant-scope";
import { createOrganization, resetDatabase } from "@/test/integration/database";

let world: {
  orgA: { id: string };
  orgB: { id: string };
  logA: { id: string };
  logB: { id: string };
};

beforeEach(async () => {
  await resetDatabase();
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [],
  });
  const logA = await prisma.auditLog.create({
    data: { organizationId: orgA.id, action: "created", entityType: "note" },
    select: { id: true },
  });
  const logB = await prisma.auditLog.create({
    data: { organizationId: orgB.id, action: "created", entityType: "note" },
    select: { id: true },
  });
  world = { orgA, orgB, logA, logB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("zakres organizacji zadania na kliencie Prisma z guardem", () => {
  it("findMany przypięte do organizacji zadania zwraca tylko jej wiersz", async () => {
    const rows = await runInOrganizationScope(world.orgA.id, () =>
      prisma.auditLog.findMany({
        where: { organizationId: world.orgA.id },
        select: { id: true, organizationId: true },
      }),
    );

    expect(rows).toEqual([
      { id: world.logA.id, organizationId: world.orgA.id },
    ]);
  });

  it("findMany przypięte do innej organizacji odrzuca TenantScopeError", async () => {
    const result = runInOrganizationScope(world.orgA.id, () =>
      prisma.auditLog.findMany({ where: { organizationId: world.orgB.id } }),
    );

    await expect(result).rejects.toBeInstanceOf(TenantScopeError);
    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "AuditLog",
      operation: "findMany",
      message: "auditLog.findMany outside job organization",
    });
  });

  it("create dla innej organizacji odrzuca i nie dodaje jej wiersza", async () => {
    const result = runInOrganizationScope(world.orgA.id, () =>
      prisma.auditLog.create({
        data: {
          organizationId: world.orgB.id,
          action: "created",
          entityType: "note",
        },
      }),
    );

    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "AuditLog",
      operation: "create",
      message: "auditLog.create outside job organization",
    });
    const rowsOfB = await withoutTenantScope("test: wiersze org B", () =>
      prisma.auditLog.findMany({
        where: { organizationId: world.orgB.id },
        select: { id: true },
      }),
    );
    expect(rowsOfB).toEqual([{ id: world.logB.id }]);
  });

  it("create dla organizacji zadania zapisuje wiersz tylko w niej", async () => {
    await runInOrganizationScope(world.orgA.id, () =>
      prisma.auditLog.create({
        data: {
          organizationId: world.orgA.id,
          action: "updated",
          entityType: "note",
        },
      }),
    );

    expect(
      await prisma.auditLog.count({ where: { organizationId: world.orgA.id } }),
    ).toBe(2);
    expect(
      await prisma.auditLog.count({ where: { organizationId: world.orgB.id } }),
    ).toBe(1);
  });
});
