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

describe("plugin audit-logs na prawdziwym better-auth", () => {
  it("zaproszenie wysłane w organizacji A tworzy member.invited w A, nie w B", async () => {
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

  it("odrzucone zaproszenie (zła rola) nie tworzy wpisu", async () => {
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

  it("zmiana roli zapisuje poprzednią rolę odczytaną przed zmianą", async () => {
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

  it("usunięcie członka tworzy member.removed w A, a B pozostaje puste", async () => {
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

  it("anulowanie zaproszenia tworzy invitation.canceled w organizacji zaproszenia", async () => {
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

  it("przyjęcie zaproszenia tworzy invitation.accepted z aktorem przyjmującym", async () => {
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

  it("inne endpointy organizacji nie tworzą wpisów", async () => {
    await auth.api.listOrganizations({ headers: world.headersA });
    await auth.api.getFullOrganization({ headers: world.headersA });
    await auth.api.listInvitations({ headers: world.headersA });
    expect(
      await withoutTenantScope("test assertion", () => prisma.auditLog.count()),
    ).toBe(0);
  });
});
