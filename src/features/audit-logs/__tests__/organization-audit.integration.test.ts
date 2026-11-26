import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeSignedCookie } from "better-call";

vi.mock("@/shared/lib/mailer", () => ({
  sendOrganizationInvitationEmail: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));

import { auth } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import { withoutTenantScope } from "@/shared/lib/tenant-scope";
import {
  createOrganization,
  createInvitation,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

let world: {
  alice: { id: string };
  bob: { id: string };
  orgA: { id: string };
  orgB: { id: string };
  headersA: Headers;
};

async function headersFor(sessionId: string): Promise<Headers> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { token: true },
  });
  const cookie = await serializeSignedCookie(
    "better-auth.session_token",
    session.token,
    process.env.BETTER_AUTH_SECRET ?? "",
  );
  return new Headers({ cookie: cookie.split(";")[0] ?? "" });
}

beforeEach(async () => {
  await resetDatabase();
  const alice = await createUser({ email: "alice@a.example", role: "admin" });
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
  const session = await createSession({
    userId: alice.id,
    activeOrganizationId: orgA.id,
  });
  world = { alice, bob, orgA, orgB, headersA: await headersFor(session.id) };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("audit-logs rows from core organization events on real better-auth", () => {
  it("an invitation sent in organization A writes member.invited in A, not in B", async () => {
    const invitation = await auth.api.createInvitation({
      headers: world.headersA,
      body: { email: "nowy@a.example", role: "member" },
    });

    const rowsA = await prisma.auditLog.findMany({
      where: { organizationId: world.orgA.id },
    });
    const rowsB = await prisma.auditLog.findMany({
      where: { organizationId: world.orgB.id },
    });
    expect(rowsB).toHaveLength(0);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({
      action: "member.invited",
      entityType: "invitation",
      entityId: invitation.id,
      userId: world.alice.id,
      newData: { email: "nowy@a.example", role: "member" },
    });
  });

  it("a rejected invitation (invalid role) writes no row", async () => {
    await expect(
      auth.api.createInvitation({
        headers: world.headersA,
        body: { email: "nowy@a.example", role: "nieistniejaca" as "member" },
      }),
    ).rejects.toThrow();
    expect(
      await withoutTenantScope("test assertion", () => prisma.auditLog.count()),
    ).toBe(0);
  });

  it("a role change writes the previous role read before the change", async () => {
    const carol = await createUser({ email: "carol@a.example" });
    const memberRow = await prisma.member.create({
      data: { organizationId: world.orgA.id, userId: carol.id, role: "member" },
    });
    await auth.api.updateMemberRole({
      headers: world.headersA,
      body: { memberId: memberRow.id, role: "admin" },
    });
    const rows = await prisma.auditLog.findMany({
      where: { organizationId: world.orgA.id, action: "member.role_changed" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityId: memberRow.id,
      oldData: { role: "member" },
      newData: { role: "admin" },
    });
  });

  it("removing a member writes member.removed in A and B stays empty", async () => {
    const carol = await createUser({ email: "carol@a.example" });
    const memberRow = await prisma.member.create({
      data: { organizationId: world.orgA.id, userId: carol.id, role: "member" },
    });
    await auth.api.removeMember({
      headers: world.headersA,
      body: { memberIdOrEmail: memberRow.id },
    });
    const rows = await withoutTenantScope("test assertion", () =>
      prisma.auditLog.findMany({
        where: { action: "member.removed" },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: world.orgA.id,
      oldData: { userId: carol.id, role: "member" },
    });
  });

  it("canceling an invitation writes invitation.canceled in the invitation's organization", async () => {
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.alice.id,
      email: "nowy@a.example",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await auth.api.cancelInvitation({
      headers: world.headersA,
      body: { invitationId: invitation.id },
    });
    const rows = await withoutTenantScope("test assertion", () =>
      prisma.auditLog.findMany(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: world.orgA.id,
      action: "invitation.canceled",
      entityType: "invitation",
      entityId: invitation.id,
      userId: world.alice.id,
    });
  });

  it("accepting an invitation writes invitation.accepted with the accepting user as actor", async () => {
    const dave = await createUser({ email: "dave@a.example" });
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.alice.id,
      email: "dave@a.example",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const daveSession = await createSession({
      userId: dave.id,
      activeOrganizationId: null,
    });
    await auth.api.acceptInvitation({
      headers: await headersFor(daveSession.id),
      body: { invitationId: invitation.id },
    });
    const rows = await withoutTenantScope("test assertion", () =>
      prisma.auditLog.findMany(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: world.orgA.id,
      action: "invitation.accepted",
      entityType: "invitation",
      entityId: invitation.id,
      userId: dave.id,
    });
  });

  it("other organization endpoints write no rows", async () => {
    await auth.api.listOrganizations({ headers: world.headersA });
    await auth.api.getFullOrganization({ headers: world.headersA });
    await auth.api.listInvitations({ headers: world.headersA });
    expect(
      await withoutTenantScope("test assertion", () => prisma.auditLog.count()),
    ).toBe(0);
  });

  it("two invitations through better-auth write exactly one member.invited row each, without service mode", async () => {
    const first = await auth.api.createInvitation({
      headers: world.headersA,
      body: { email: "pierwszy@a.example", role: "member" },
    });
    const second = await auth.api.createInvitation({
      headers: world.headersA,
      body: { email: "drugi@a.example", role: "admin" },
    });

    const rows = await withoutTenantScope("test assertion", () =>
      prisma.auditLog.findMany({ where: { action: "member.invited" } }),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.map((row) => ({
        organizationId: row.organizationId,
        userId: row.userId,
        entityType: row.entityType,
        entityId: row.entityId,
        newData: row.newData,
        serviceMode: row.serviceMode,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          organizationId: world.orgA.id,
          userId: world.alice.id,
          entityType: "invitation",
          entityId: first.id,
          newData: { email: "pierwszy@a.example", role: "member" },
          serviceMode: false,
        },
        {
          organizationId: world.orgA.id,
          userId: world.alice.id,
          entityType: "invitation",
          entityId: second.id,
          newData: { email: "drugi@a.example", role: "admin" },
          serviceMode: false,
        },
      ]),
    );
  });

  it("accepting an invitation writes no row for organizations.member-added", async () => {
    const dave = await createUser({ email: "dave@a.example" });
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.alice.id,
      email: "dave@a.example",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const daveSession = await createSession({
      userId: dave.id,
      activeOrganizationId: null,
    });

    await auth.api.acceptInvitation({
      headers: await headersFor(daveSession.id),
      body: { invitationId: invitation.id },
    });

    const actions = await withoutTenantScope("test assertion", () =>
      prisma.auditLog.findMany({ select: { action: true } }),
    );
    expect(actions).toEqual([{ action: "invitation.accepted" }]);
  });

  it("updating the role of an unknown member writes no row", async () => {
    await expect(
      auth.api.updateMemberRole({
        headers: world.headersA,
        body: { memberId: "member-that-does-not-exist", role: "admin" },
      }),
    ).rejects.toThrow();

    expect(
      await withoutTenantScope("test assertion", () => prisma.auditLog.count()),
    ).toBe(0);
  });
});
