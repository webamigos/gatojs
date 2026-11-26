import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/prisma";
import {
  createInvitation,
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";
import { coreEvents } from "../core-events";
import type { DomainEvent } from "../define-events";
import { createEventBus } from "../event-bus";

const IN_A_DAY = new Date(Date.now() + 24 * 60 * 60 * 1000);

interface World {
  orgA: { id: string };
  orgB: { id: string };
  invitationA: { id: string };
  invitationB: { id: string };
}

let world: World;

async function cancelPendingInvitations(event: DomainEvent): Promise<void> {
  await prisma.invitation.updateMany({
    where: { organizationId: event.organizationId, status: "pending" },
    data: { status: "canceled" },
  });
}

async function promoteMembers(event: DomainEvent): Promise<void> {
  await prisma.member.updateMany({
    where: { organizationId: event.organizationId, role: "member" },
    data: { role: "admin" },
  });
}

async function markOrganization(event: DomainEvent): Promise<void> {
  await prisma.organization.update({
    where: { id: event.organizationId },
    data: { name: `touched by ${event.name}` },
  });
}

function writingBus() {
  return createEventBus({
    core: coreEvents,
    events: [],
    subscribers: [
      {
        module: "probe",
        value: {
          "users.invited": [
            { id: "probe.cancel-pending", run: cancelPendingInvitations },
            { id: "probe.promote-members", run: promoteMembers },
            { id: "probe.mark-organization", run: markOrganization },
          ],
        },
      },
    ] as Parameters<typeof createEventBus>[0]["subscribers"],
  });
}

async function snapshot(organizationId: string) {
  const [organization, members, invitations] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    }),
    prisma.member.findMany({
      where: { organizationId },
      select: { role: true },
      orderBy: { role: "asc" },
    }),
    prisma.invitation.findMany({
      where: { organizationId },
      select: { email: true, status: true },
      orderBy: { email: "asc" },
    }),
  ]);
  return {
    name: organization.name,
    roles: members.map((member) => member.role),
    invitations,
  };
}

beforeEach(async () => {
  await resetDatabase();
  const alice = await createUser({ email: "alice@a.example" });
  const carol = await createUser({ email: "carol@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  const dave = await createUser({ email: "dave@b.example" });
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
    members: [
      { userId: bob.id, role: "owner" },
      { userId: dave.id, role: "member" },
    ],
  });
  const invitationA = await createInvitation({
    organizationId: orgA.id,
    inviterId: alice.id,
    email: "new-a@example.com",
    expiresAt: IN_A_DAY,
  });
  const invitationB = await createInvitation({
    organizationId: orgB.id,
    inviterId: bob.id,
    email: "new-b@example.com",
    expiresAt: IN_A_DAY,
  });
  world = { orgA, orgB, invitationA, invitationB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const UNTOUCHED_A = {
  name: "Org A",
  roles: ["member", "owner"],
  invitations: [{ email: "new-a@example.com", status: "pending" }],
};
const UNTOUCHED_B = {
  name: "Org B",
  roles: ["member", "owner"],
  invitations: [{ email: "new-b@example.com", status: "pending" }],
};

describe("event subscribers that filter by event.organizationId", () => {
  it("an event for organization A changes only organization A's rows", async () => {
    await writingBus().emit(
      { organizationId: world.orgA.id, actorUserId: null },
      "users.invited",
      {
        invitationId: world.invitationA.id,
        email: "new-a@example.com",
        role: "member",
      },
    );

    expect(await snapshot(world.orgA.id)).toEqual({
      name: "touched by users.invited",
      roles: ["admin", "owner"],
      invitations: [{ email: "new-a@example.com", status: "canceled" }],
    });
    expect(await snapshot(world.orgB.id)).toEqual(UNTOUCHED_B);
  });

  it("an event for organization B changes only organization B's rows", async () => {
    await writingBus().emit(
      { organizationId: world.orgB.id, actorUserId: null },
      "users.invited",
      {
        invitationId: world.invitationB.id,
        email: "new-b@example.com",
        role: "member",
      },
    );

    expect(await snapshot(world.orgB.id)).toEqual({
      name: "touched by users.invited",
      roles: ["admin", "owner"],
      invitations: [{ email: "new-b@example.com", status: "canceled" }],
    });
    expect(await snapshot(world.orgA.id)).toEqual(UNTOUCHED_A);
  });

  it("organization B's id smuggled into the payload of an event for A still touches only A", async () => {
    await writingBus().emit(
      { organizationId: world.orgA.id, actorUserId: null },
      "users.invited",
      {
        invitationId: world.invitationA.id,
        email: "new-a@example.com",
        role: "member",
        organizationId: world.orgB.id,
      },
    );

    expect(await snapshot(world.orgB.id)).toEqual(UNTOUCHED_B);
    expect((await snapshot(world.orgA.id)).name).toBe(
      "touched by users.invited",
    );
  });

  it("an invalid payload for A writes nothing in either organization", async () => {
    await expect(
      writingBus().emit(
        { organizationId: world.orgA.id, actorUserId: null },
        "users.invited",
        { invitationId: world.invitationA.id, role: "member" },
      ),
    ).rejects.toThrow("invalid payload for users.invited");

    expect(await snapshot(world.orgA.id)).toEqual(UNTOUCHED_A);
    expect(await snapshot(world.orgB.id)).toEqual(UNTOUCHED_B);
  });
});
