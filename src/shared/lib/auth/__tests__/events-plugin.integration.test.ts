import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeSignedCookie } from "better-call";
import type { DomainEvent } from "@/shared/lib/events";

const { received, envOverrides } = vi.hoisted(() => ({
  received: [] as DomainEvent[],
  envOverrides: {} as Record<string, unknown>,
}));

vi.mock("@/modules.generated", async () => {
  const realEnv = (await import("@gatojs/env")).createEnv([]);
  const record = (event: DomainEvent) => {
    received.push(event);
  };
  return {
    env: new Proxy(
      {},
      {
        get: (_target, key) =>
          typeof key === "string" && key in envOverrides
            ? envOverrides[key]
            : Reflect.get(realEnv, key),
      },
    ),
    authPlugins: [],
    auditSinks: [],
    moduleEvents: [],
    moduleSubscribers: [
      {
        module: "probe",
        value: {
          "organizations.created": { id: "probe.created", run: record },
          "organizations.member-added": {
            id: "probe.member-added",
            run: record,
          },
          "organizations.member-removed": {
            id: "probe.member-removed",
            run: record,
          },
          "organizations.member-role-changed": {
            id: "probe.member-role-changed",
            run: record,
          },
          "users.invited": { id: "probe.invited", run: record },
          "users.invitation-accepted": {
            id: "probe.invitation-accepted",
            run: record,
          },
          "users.invitation-canceled": {
            id: "probe.invitation-canceled",
            run: record,
          },
          "auth.signed-up": { id: "probe.signed-up", run: record },
        },
      },
    ],
  };
});
vi.mock("@/shared/lib/mailer", () => ({
  sendOrganizationInvitationEmail: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));

import { auth } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import {
  createInvitation,
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const IN_AN_HOUR = () => new Date(Date.now() + 60 * 60 * 1000);

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

async function addMember(
  organizationId: string,
  email: string,
  role: "admin" | "member",
): Promise<{ userId: string; memberId: string }> {
  const user = await createUser({ email });
  const member = await prisma.member.create({
    data: { organizationId, userId: user.id, role },
    select: { id: true },
  });
  return { userId: user.id, memberId: member.id };
}

function inOrganization(organizationId: string): DomainEvent[] {
  return received.filter((event) => event.organizationId === organizationId);
}

beforeEach(async () => {
  received.length = 0;
  for (const key of Object.keys(envOverrides)) {
    delete envOverrides[key];
  }
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

describe("core auth events plugin on real better-auth, without audit-logs", () => {
  it("/organization/invite-member emits users.invited in organization A with the inviter as actor", async () => {
    const invitation = await auth.api.createInvitation({
      headers: world.headersA,
      body: { email: "nowy@a.example", role: "member" },
    });

    expect(invitation.email).toBe("nowy@a.example");
    expect(received).toEqual([
      {
        name: "users.invited",
        organizationId: world.orgA.id,
        actorUserId: world.alice.id,
        serviceMode: false,
        payload: {
          invitationId: invitation.id,
          email: "nowy@a.example",
          role: "member",
        },
      },
    ]);
    expect(inOrganization(world.orgB.id)).toEqual([]);
  });

  it("/organization/cancel-invitation emits users.invitation-canceled in the invitation's organization", async () => {
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.alice.id,
      email: "nowy@a.example",
      expiresAt: IN_AN_HOUR(),
    });

    await auth.api.cancelInvitation({
      headers: world.headersA,
      body: { invitationId: invitation.id },
    });

    expect(received).toEqual([
      {
        name: "users.invitation-canceled",
        organizationId: world.orgA.id,
        actorUserId: world.alice.id,
        serviceMode: false,
        payload: { invitationId: invitation.id },
      },
    ]);
    expect(inOrganization(world.orgB.id)).toEqual([]);
  });

  it("/organization/accept-invitation emits users.invitation-accepted then organizations.member-added with the accepting user as actor", async () => {
    const dave = await createUser({ email: "dave@a.example" });
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.alice.id,
      email: "dave@a.example",
      role: "admin",
      expiresAt: IN_AN_HOUR(),
    });
    const daveSession = await createSession({
      userId: dave.id,
      activeOrganizationId: null,
    });

    await auth.api.acceptInvitation({
      headers: await headersFor(daveSession.id),
      body: { invitationId: invitation.id },
    });

    const member = await prisma.member.findFirstOrThrow({
      where: { organizationId: world.orgA.id, userId: dave.id },
      select: { id: true },
    });
    expect(received).toEqual([
      {
        name: "users.invitation-accepted",
        organizationId: world.orgA.id,
        actorUserId: dave.id,
        serviceMode: false,
        payload: { invitationId: invitation.id, userId: dave.id },
      },
      {
        name: "organizations.member-added",
        organizationId: world.orgA.id,
        actorUserId: dave.id,
        serviceMode: false,
        payload: { memberId: member.id, userId: dave.id, role: "admin" },
      },
    ]);
    expect(inOrganization(world.orgB.id)).toEqual([]);
  });

  it("/organization/update-member-role from member to admin emits previousRole member and role admin", async () => {
    const carol = await addMember(world.orgA.id, "carol@a.example", "member");

    await auth.api.updateMemberRole({
      headers: world.headersA,
      body: { memberId: carol.memberId, role: "admin" },
    });

    expect(received).toEqual([
      {
        name: "organizations.member-role-changed",
        organizationId: world.orgA.id,
        actorUserId: world.alice.id,
        serviceMode: false,
        payload: {
          memberId: carol.memberId,
          userId: carol.userId,
          previousRole: "member",
          role: "admin",
        },
      },
    ]);
    expect(inOrganization(world.orgB.id)).toEqual([]);
  });

  it("/organization/update-member-role from admin to member emits previousRole admin and role member", async () => {
    const carol = await addMember(world.orgA.id, "carol@a.example", "admin");

    await auth.api.updateMemberRole({
      headers: world.headersA,
      body: { memberId: carol.memberId, role: "member" },
    });

    expect(received.map((event) => event.payload)).toEqual([
      {
        memberId: carol.memberId,
        userId: carol.userId,
        previousRole: "admin",
        role: "member",
      },
    ]);
  });

  it("/organization/remove-member emits organizations.member-removed with the removed member's role", async () => {
    const carol = await addMember(world.orgA.id, "carol@a.example", "member");

    await auth.api.removeMember({
      headers: world.headersA,
      body: { memberIdOrEmail: carol.memberId },
    });

    expect(received).toEqual([
      {
        name: "organizations.member-removed",
        organizationId: world.orgA.id,
        actorUserId: world.alice.id,
        serviceMode: false,
        payload: {
          memberId: carol.memberId,
          userId: carol.userId,
          role: "member",
        },
      },
    ]);
    expect(inOrganization(world.orgB.id)).toEqual([]);
  });

  it("an invitation with an invalid role is rejected and emits nothing", async () => {
    await expect(
      auth.api.createInvitation({
        headers: world.headersA,
        body: { email: "nowy@a.example", role: "nieistniejaca" as "member" },
      }),
    ).rejects.toThrow();

    expect(received).toEqual([]);
  });

  it("an invitation into organization B by a member of A only is rejected and emits nothing", async () => {
    await expect(
      auth.api.createInvitation({
        headers: world.headersA,
        body: {
          email: "nowy@b.example",
          role: "member",
          organizationId: world.orgB.id,
        },
      }),
    ).rejects.toThrow();

    expect(received).toEqual([]);
    expect(await prisma.invitation.count()).toBe(0);
  });

  it("updating the role of an unknown member is rejected and emits nothing", async () => {
    await expect(
      auth.api.updateMemberRole({
        headers: world.headersA,
        body: { memberId: "member-that-does-not-exist", role: "admin" },
      }),
    ).rejects.toThrow();

    expect(received).toEqual([]);
  });

  it("removing an unknown member is rejected and emits nothing", async () => {
    await expect(
      auth.api.removeMember({
        headers: world.headersA,
        body: { memberIdOrEmail: "member-that-does-not-exist" },
      }),
    ).rejects.toThrow();

    expect(received).toEqual([]);
  });

  it("removing a member of organization B from organization A is rejected, emits nothing and keeps the member", async () => {
    const intruded = await addMember(
      world.orgB.id,
      "carol@b.example",
      "member",
    );

    await expect(
      auth.api.removeMember({
        headers: world.headersA,
        body: { memberIdOrEmail: intruded.memberId },
      }),
    ).rejects.toThrow();

    expect(received).toEqual([]);
    expect(
      await prisma.member.count({ where: { id: intruded.memberId } }),
    ).toBe(1);
  });

  it("other organization endpoints emit nothing", async () => {
    await auth.api.listOrganizations({ headers: world.headersA });
    await auth.api.getFullOrganization({ headers: world.headersA });
    await auth.api.listInvitations({ headers: world.headersA });

    expect(received).toEqual([]);
  });

  it("/organization/create with MULTI_ORG=true emits one organizations.created for the new organization", async () => {
    envOverrides.MULTI_ORG = true;

    const created = await auth.api.createOrganization({
      headers: world.headersA,
      body: { name: "Org C", slug: "org-c" },
    });

    const stored = await prisma.organization.findUniqueOrThrow({
      where: { slug: "org-c" },
      select: { id: true },
    });
    expect(created?.id).toBe(stored.id);
    expect(received).toEqual([
      {
        name: "organizations.created",
        organizationId: stored.id,
        actorUserId: world.alice.id,
        serviceMode: false,
        payload: { name: "Org C", slug: "org-c", ownerUserId: world.alice.id },
      },
    ]);
    expect(inOrganization(world.orgA.id)).toEqual([]);
    expect(inOrganization(world.orgB.id)).toEqual([]);
  });

  it("/organization/create with MULTI_ORG=false is rejected and emits nothing", async () => {
    envOverrides.MULTI_ORG = false;

    await expect(
      auth.api.createOrganization({
        headers: world.headersA,
        body: { name: "Org C", slug: "org-c" },
      }),
    ).rejects.toThrow();

    expect(received).toEqual([]);
    expect(await prisma.organization.count({ where: { slug: "org-c" } })).toBe(
      0,
    );
  });
});
