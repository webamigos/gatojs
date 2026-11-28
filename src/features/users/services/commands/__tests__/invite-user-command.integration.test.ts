import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeSignedCookie } from "better-call";
import type { AuditEvent } from "@/shared/lib/audit";
import type { DomainEvent } from "@/shared/lib/events";

const {
  recordedEvents,
  currentHeaders,
  domainEvents,
  subscriberEntries,
  sinkEntries,
} = vi.hoisted(() => {
  const recorded = [] as AuditEvent[];
  return {
    recordedEvents: recorded,
    currentHeaders: { value: new Headers() },
    domainEvents: [] as DomainEvent[],
    subscriberEntries: [] as { module: string; value: unknown }[],
    sinkEntries: [
      async (event: AuditEvent) => {
        recorded.push(event);
      },
    ] as ((event: AuditEvent) => Promise<void>)[],
  };
});

vi.mock("@/modules.generated", async () => ({
  env: (await import("@gatojs/env")).createEnv([]),
  authPlugins: [],
  moduleCommandHooks: [],
  moduleEvents: [],
  auditSinks: sinkEntries,
  moduleSubscribers: subscriberEntries,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => currentHeaders.value),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/mailer", () => ({
  sendWelcomeSetPasswordEmail: vi.fn(async () => ({ data: null })),
  sendPasswordResetEmail: vi.fn(async () => undefined),
  sendOrganizationInvitationEmail: vi.fn(async () => undefined),
}));

// WHY: cykl modules.generated -> audit-logs -> audit.ts wiąże audit.ts z oryginalnym
// auditSinks, jeśli pierwszy załaduje się modules.generated; import audit.ts jako pierwszy
// wiąże go z podmienionym auditSinks.
import "@/shared/lib/audit";
import { prisma } from "@/shared/lib/prisma";
import { inviteUserCommand } from "../invite-user-command";
import {
  createInvitation,
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

// WHY: the mock factory must not import the subscribers (ADR-61: emit-event.ts would bind to the
// original registry); the bus reads this list on the first emit, after this line ran.
const hasAuditLogs = fs.existsSync(
  path.join(process.cwd(), "src/features/audit-logs/module.ts"),
);

if (hasAuditLogs) {
  const { organizationAuditSubscribers } = await vi.importActual<{
    organizationAuditSubscribers: unknown;
  }>("@/features/audit-logs/services/organization-audit-subscribers");
  subscriberEntries.push({
    module: "audit-logs",
    value: organizationAuditSubscribers,
  });
  const { auditSink } = await vi.importActual<{
    auditSink: (event: AuditEvent) => Promise<void>;
  }>("@/features/audit-logs/audit-sink");
  sinkEntries.push(auditSink);
}

subscriberEntries.push({
  module: "probe",
  value: {
    "auth.signed-up": {
      id: "probe.signed-up",
      run: (event: DomainEvent) => {
        domainEvents.push(event);
      },
    },
    "users.invited": {
      id: "probe.invited",
      run: (event: DomainEvent) => {
        domainEvents.push(event);
      },
    },
    "users.invitation-accepted": {
      id: "probe.invitation-accepted",
      run: (event: DomainEvent) => {
        domainEvents.push(event);
      },
    },
    "organizations.member-added": {
      id: "probe.member-added",
      run: (event: DomainEvent) => {
        domainEvents.push(event);
      },
    },
  },
});

let world: {
  admin: { id: string };
  superadmin: { id: string };
  orgA: { id: string };
  orgB: { id: string };
};

async function signInAs(
  userId: string,
  activeOrganizationId: string,
): Promise<void> {
  const session = await createSession({ userId, activeOrganizationId });
  const { token } = await prisma.session.findUniqueOrThrow({
    where: { id: session.id },
    select: { token: true },
  });
  const cookie = await serializeSignedCookie(
    "better-auth.session_token",
    token,
    process.env.BETTER_AUTH_SECRET ?? "",
  );
  currentHeaders.value = new Headers({ cookie: cookie.split(";")[0] ?? "" });
}

const IN_A_DAY = new Date(Date.now() + 24 * 60 * 60 * 1000);

beforeEach(async () => {
  recordedEvents.length = 0;
  domainEvents.length = 0;
  currentHeaders.value = new Headers();
  await resetDatabase();
  const admin = await createUser({ email: "admin@a.example", role: "admin" });
  const superadmin = await createUser({
    email: "serwis@webamigos.example",
    role: "superadmin",
  });
  const ownerB = await createUser({ email: "owner@b.example" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [{ userId: admin.id, role: "owner" }],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: ownerB.id, role: "owner" }],
  });
  world = { admin, superadmin, orgA, orgB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!hasAuditLogs)(
  "inviteUserCommand on real better-auth: audit log",
  () => {
    it("an admin of organization A writes exactly one entry, member.invited with their own actor and the invitation id from the database, without invitation.accepted", async () => {
      await signInAs(world.admin.id, world.orgA.id);

      const result = await inviteUserCommand({
        name: "Nowy Użytkownik",
        email: "nowy@a.example",
        role: "member",
      });

      expect(result.success).toBe(true);
      const invitation = await prisma.invitation.findFirstOrThrow({
        where: { email: "nowy@a.example" },
        select: { id: true, organizationId: true },
      });
      expect(invitation.organizationId).toBe(world.orgA.id);

      expect(recordedEvents).toHaveLength(1);
      expect(recordedEvents[0]).toMatchObject({
        organizationId: world.orgA.id,
        actorUserId: world.admin.id,
        serviceMode: false,
        action: "member.invited",
        entityType: "invitation",
        entityId: invitation.id,
        newData: { email: "nowy@a.example", role: "member" },
      });
      expect(
        recordedEvents.filter(
          (event) => event.action === "invitation.accepted",
        ),
      ).toEqual([]);
      expect(await auditRows(world.orgA.id)).toEqual([
        { action: "member.invited", userId: world.admin.id },
      ]);
      expect(await auditRows(world.orgB.id)).toEqual([]);
    });

    it("a superadmin with a confirmation in A writes no invitation.accepted entry", async () => {
      await signInAs(world.superadmin.id, world.orgA.id);

      await inviteUserCommand(
        { name: "Nowy Użytkownik", email: "nowy@a.example", role: "member" },
        { serviceModeConfirmed: true, organizationId: world.orgA.id },
      );

      expect(recordedEvents.map((event) => event.action)).toEqual([
        "member.invited",
      ]);
      expect(await auditRows(world.orgA.id)).toEqual([
        { action: "member.invited", userId: world.superadmin.id },
      ]);
    });

    it("a public sign-up with an invitation to A writes exactly one invitation.accepted in A with the new user as actor and nothing in B", async () => {
      const invitation = await createInvitation({
        organizationId: world.orgA.id,
        inviterId: world.admin.id,
        email: "gosc@a.example",
        role: "member",
        expiresAt: IN_A_DAY,
      });
      const { auth } = await import("@/shared/lib/auth");

      await auth.api.signUpEmail({
        body: {
          name: "Gość",
          email: "gosc@a.example",
          password: "password-123456",
          invitationId: invitation.id,
        } as { name: string; email: string; password: string },
      });

      const newUser = await prisma.user.findUniqueOrThrow({
        where: { email: "gosc@a.example" },
        select: { id: true },
      });
      const accepted = recordedEvents.filter(
        (event) => event.action === "invitation.accepted",
      );
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toMatchObject({
        organizationId: world.orgA.id,
        actorUserId: newUser.id,
        entityType: "invitation",
        entityId: invitation.id,
      });
      expect(await auditRows(world.orgA.id)).toEqual([
        { action: "invitation.accepted", userId: newUser.id },
      ]);
      expect(await auditRows(world.orgB.id)).toEqual([]);
    });

    it("a superadmin without a membership in A, with a confirmation, writes member.invited with their own actor and serviceMode: true", async () => {
      await signInAs(world.superadmin.id, world.orgA.id);

      const result = await inviteUserCommand(
        { name: "Nowy Użytkownik", email: "nowy@a.example", role: "member" },
        { serviceModeConfirmed: true, organizationId: world.orgA.id },
      );

      expect(result.success).toBe(true);
      const invitation = await prisma.invitation.findFirstOrThrow({
        where: { email: "nowy@a.example" },
        select: { id: true },
      });
      const invited = recordedEvents.filter(
        (event) => event.action === "member.invited",
      );
      expect(invited).toHaveLength(1);
      expect(invited[0]).toMatchObject({
        organizationId: world.orgA.id,
        actorUserId: world.superadmin.id,
        serviceMode: true,
        entityId: invitation.id,
      });
    });

    it("two invitations by the admin write exactly one member.invited each, through the audit-logs subscriber", async () => {
      await signInAs(world.admin.id, world.orgA.id);

      await inviteUserCommand({
        name: "Pierwszy",
        email: "pierwszy@a.example",
        role: "member",
      });
      await inviteUserCommand({
        name: "Drugi",
        email: "drugi@a.example",
        role: "admin",
      });

      const first = await prisma.invitation.findFirstOrThrow({
        where: { email: "pierwszy@a.example" },
        select: { id: true },
      });
      const second = await prisma.invitation.findFirstOrThrow({
        where: { email: "drugi@a.example" },
        select: { id: true },
      });
      const invited = recordedEvents.filter(
        (event) => event.action === "member.invited",
      );
      expect(invited).toHaveLength(2);
      expect(invited.map((event) => event.entityId)).toEqual([
        first.id,
        second.id,
      ]);
      expect(invited.map((event) => event.newData)).toEqual([
        { email: "pierwszy@a.example", role: "member" },
        { email: "drugi@a.example", role: "admin" },
      ]);
      expect(invited.map((event) => event.serviceMode)).toEqual([false, false]);
    });

    it("a superadmin in service mode without a confirmation creates neither an invitation nor an entry", async () => {
      await signInAs(world.superadmin.id, world.orgA.id);

      const result = await inviteUserCommand({
        name: "Nowy Użytkownik",
        email: "nowy@a.example",
        role: "member",
      });

      expect(result).toEqual({
        success: false,
        error: "Potwierdź zmianę w trybie serwisowym",
      });
      expect(await prisma.invitation.count()).toBe(0);
      expect(recordedEvents).toEqual([]);
    });
  },
);

describe("inviteUserCommand on real better-auth: domain events", () => {
  it("an invitation by an admin of organization A gives exactly users.invited and organizations.member-added with organization A and the admin as actor, without auth.signed-up and users.invitation-accepted", async () => {
    await signInAs(world.admin.id, world.orgA.id);

    const result = await inviteUserCommand({
      name: "Nowy Użytkownik",
      email: "nowy@a.example",
      role: "admin",
    });

    expect(result.success).toBe(true);
    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { email: "nowy@a.example" },
      select: { id: true },
    });
    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email: "nowy@a.example" },
      select: { id: true },
    });
    const invitedMember = await prisma.member.findFirstOrThrow({
      where: { organizationId: world.orgA.id, userId: invitedUser.id },
      select: { id: true },
    });
    expect(domainEvents.map((event) => event.name)).toEqual([
      "users.invited",
      "organizations.member-added",
    ]);
    expect(domainEvents).toEqual([
      {
        name: "users.invited",
        organizationId: world.orgA.id,
        actorUserId: world.admin.id,
        serviceMode: false,
        payload: {
          invitationId: invitation.id,
          email: "nowy@a.example",
          role: "admin",
        },
      },
      {
        name: "organizations.member-added",
        organizationId: world.orgA.id,
        actorUserId: world.admin.id,
        serviceMode: false,
        payload: {
          memberId: invitedMember.id,
          userId: invitedUser.id,
          role: "admin",
        },
      },
    ]);
  });

  it("organizations.member-added after an invitation points to the invitee's member, not the admin's nor a member from another organization", async () => {
    await signInAs(world.admin.id, world.orgA.id);

    await inviteUserCommand({
      name: "Nowy Użytkownik",
      email: "nowy@a.example",
      role: "member",
    });

    const adminMember = await prisma.member.findFirstOrThrow({
      where: { organizationId: world.orgA.id, userId: world.admin.id },
      select: { id: true },
    });
    const memberAdded = domainEvents.filter(
      (event) => event.name === "organizations.member-added",
    );
    expect(memberAdded).toHaveLength(1);
    expect(memberAdded[0]?.payload).not.toMatchObject({
      memberId: adminMember.id,
    });
    expect(
      domainEvents.filter((event) => event.organizationId === world.orgB.id),
    ).toEqual([]);
  });

  it("an invitation by an admin still creates the invitee's membership in organization A", async () => {
    await signInAs(world.admin.id, world.orgA.id);

    await inviteUserCommand({
      name: "Nowy Użytkownik",
      email: "nowy@a.example",
      role: "admin",
    });

    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email: "nowy@a.example" },
      select: { id: true },
    });
    const memberships = await prisma.member.findMany({
      where: { userId: invitedUser.id },
      select: { organizationId: true, role: true },
    });
    expect(memberships).toEqual([
      { organizationId: world.orgA.id, role: "admin" },
    ]);
  });

  it("a superadmin with a service mode confirmation gives users.invited and organizations.member-added with their own actor and serviceMode: true", async () => {
    await signInAs(world.superadmin.id, world.orgA.id);

    const result = await inviteUserCommand(
      { name: "Nowy Użytkownik", email: "nowy@a.example", role: "member" },
      { serviceModeConfirmed: true, organizationId: world.orgA.id },
    );

    expect(result.success).toBe(true);
    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email: "nowy@a.example" },
      select: { id: true },
    });
    const invitedMember = await prisma.member.findFirstOrThrow({
      where: { organizationId: world.orgA.id, userId: invitedUser.id },
      select: { id: true },
    });
    expect(domainEvents.map((event) => event.name)).toEqual([
      "users.invited",
      "organizations.member-added",
    ]);
    expect(domainEvents[0]).toMatchObject({
      organizationId: world.orgA.id,
      actorUserId: world.superadmin.id,
      serviceMode: true,
    });
    expect(domainEvents[1]).toEqual({
      name: "organizations.member-added",
      organizationId: world.orgA.id,
      actorUserId: world.superadmin.id,
      serviceMode: true,
      payload: {
        memberId: invitedMember.id,
        userId: invitedUser.id,
        role: "member",
      },
    });
  });

  it("a public sign-up with an invitation to A (outside an admin invite) gives exactly auth.signed-up, users.invitation-accepted and organizations.member-added with organization A and the new user as actor", async () => {
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.admin.id,
      email: "gosc@a.example",
      role: "admin",
      expiresAt: IN_A_DAY,
    });
    const { auth } = await import("@/shared/lib/auth");

    await auth.api.signUpEmail({
      body: {
        name: "Gość",
        email: "gosc@a.example",
        password: "password-123456",
        invitationId: invitation.id,
      } as { name: string; email: string; password: string },
    });

    const newUser = await prisma.user.findUniqueOrThrow({
      where: { email: "gosc@a.example" },
      select: { id: true },
    });
    const newMember = await prisma.member.findFirstOrThrow({
      where: { organizationId: world.orgA.id, userId: newUser.id },
      select: { id: true },
    });
    expect(domainEvents).toEqual([
      {
        name: "auth.signed-up",
        organizationId: world.orgA.id,
        actorUserId: newUser.id,
        serviceMode: false,
        payload: { userId: newUser.id, email: "gosc@a.example" },
      },
      {
        name: "users.invitation-accepted",
        organizationId: world.orgA.id,
        actorUserId: newUser.id,
        serviceMode: false,
        payload: { invitationId: invitation.id, userId: newUser.id },
      },
      {
        name: "organizations.member-added",
        organizationId: world.orgA.id,
        actorUserId: newUser.id,
        serviceMode: false,
        payload: { memberId: newMember.id, userId: newUser.id, role: "admin" },
      },
    ]);
  });

  it("a public sign-up with forged inviteSignup, adminInvite and isInviteSignup fields still gives the three invitation sign-up events", async () => {
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.admin.id,
      email: "gosc@a.example",
      role: "member",
      expiresAt: IN_A_DAY,
    });
    const { auth } = await import("@/shared/lib/auth");

    await auth.api.signUpEmail({
      body: {
        name: "Gość",
        email: "gosc@a.example",
        password: "password-123456",
        invitationId: invitation.id,
        inviteSignup: true,
        adminInvite: true,
        isInviteSignup: true,
      } as { name: string; email: string; password: string },
    });

    const newUser = await prisma.user.findUniqueOrThrow({
      where: { email: "gosc@a.example" },
      select: { id: true },
    });
    expect(domainEvents.map((event) => event.name)).toEqual([
      "auth.signed-up",
      "users.invitation-accepted",
      "organizations.member-added",
    ]);
    expect(
      domainEvents.map((event) => [event.organizationId, event.actorUserId]),
    ).toEqual([
      [world.orgA.id, newUser.id],
      [world.orgA.id, newUser.id],
      [world.orgA.id, newUser.id],
    ]);
  });
});

type AuditLogReader = {
  auditLog: {
    findMany(
      args: unknown,
    ): Promise<{ organizationId: string; newData: unknown }[]>;
  };
};

type AuditActionReader = {
  auditLog: {
    findMany(args: unknown): Promise<{ action: string; userId: string }[]>;
  };
};

async function auditRows(organizationId: string) {
  // WHY: the auditLog model exists only with the audit-logs module; projects without it still type-check.
  return (prisma as unknown as AuditActionReader).auditLog.findMany({
    where: { organizationId },
    select: { action: true, userId: true },
    orderBy: { createdAt: "asc" },
  });
}

async function invitedAuditRows(organizationId: string) {
  // WHY: the auditLog model exists only with the audit-logs module; projects without it still type-check.
  return (prisma as unknown as AuditLogReader).auditLog.findMany({
    where: { organizationId, action: "member.invited" },
    select: { organizationId: true, newData: true },
    orderBy: { createdAt: "asc" },
  });
}

describe.skipIf(!hasAuditLogs)(
  "inviteUserCommand on real better-auth: email verification and the member.invited entry",
  () => {
    it("a user invited by an admin of A has a verified email, a membership in A and exactly one member.invited row in A", async () => {
      await signInAs(world.admin.id, world.orgA.id);

      const result = await inviteUserCommand({
        name: "Nowy Użytkownik",
        email: "nowy@example.com",
        role: "member",
      });

      expect(result.success).toBe(true);
      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email: "nowy@example.com" },
        select: { id: true, emailVerified: true },
      });
      expect(invitedUser.emailVerified).toBe(true);
      expect(await invitedAuditRows(world.orgA.id)).toEqual([
        {
          organizationId: world.orgA.id,
          newData: { email: "nowy@example.com", role: "member" },
        },
      ]);
      expect(await invitedAuditRows(world.orgB.id)).toEqual([]);
      const memberships = await prisma.member.findMany({
        where: { userId: invitedUser.id },
        select: { organizationId: true, role: true },
      });
      expect(memberships).toEqual([
        { organizationId: world.orgA.id, role: "member" },
      ]);
    });

    it("after a series of invitations in A and B every invitee's membership has its own member.invited row with their email", async () => {
      const adminB = await createUser({
        email: "admin@b.example",
        role: "admin",
      });
      await prisma.member.create({
        data: {
          organizationId: world.orgB.id,
          userId: adminB.id,
          role: "owner",
        },
      });
      await signInAs(world.admin.id, world.orgA.id);
      await inviteUserCommand({
        name: "Pierwszy",
        email: "pierwszy@example.com",
        role: "member",
      });
      await inviteUserCommand({
        name: "Drugi",
        email: "drugi@example.com",
        role: "admin",
      });
      await signInAs(adminB.id, world.orgB.id);
      await inviteUserCommand({
        name: "Trzeci",
        email: "trzeci@example.com",
        role: "member",
      });

      const invitedUsers = await prisma.user.findMany({
        where: {
          email: {
            in: [
              "pierwszy@example.com",
              "drugi@example.com",
              "trzeci@example.com",
            ],
          },
        },
        select: {
          email: true,
          emailVerified: true,
          members: { select: { organizationId: true } },
        },
        orderBy: { email: "asc" },
      });
      expect(invitedUsers).toEqual([
        {
          email: "drugi@example.com",
          emailVerified: true,
          members: [{ organizationId: world.orgA.id }],
        },
        {
          email: "pierwszy@example.com",
          emailVerified: true,
          members: [{ organizationId: world.orgA.id }],
        },
        {
          email: "trzeci@example.com",
          emailVerified: true,
          members: [{ organizationId: world.orgB.id }],
        },
      ]);
      expect(await invitedAuditRows(world.orgA.id)).toEqual([
        {
          organizationId: world.orgA.id,
          newData: { email: "pierwszy@example.com", role: "member" },
        },
        {
          organizationId: world.orgA.id,
          newData: { email: "drugi@example.com", role: "admin" },
        },
      ]);
      expect(await invitedAuditRows(world.orgB.id)).toEqual([
        {
          organizationId: world.orgB.id,
          newData: { email: "trzeci@example.com", role: "member" },
        },
      ]);
    });
  },
);

describe("public sign-up on real better-auth: unverified email", () => {
  it("a public sign-up with an invitation to A creates the user with emailVerified: false", async () => {
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.admin.id,
      email: "gosc@a.example",
      role: "member",
      expiresAt: IN_A_DAY,
    });
    const { auth } = await import("@/shared/lib/auth");

    await auth.api.signUpEmail({
      body: {
        name: "Gość",
        email: "gosc@a.example",
        password: "password-123456",
        invitationId: invitation.id,
      } as { name: string; email: string; password: string },
    });

    const newUser = await prisma.user.findUniqueOrThrow({
      where: { email: "gosc@a.example" },
      select: { emailVerified: true },
    });
    expect(newUser).toEqual({ emailVerified: false });
  });

  it("a public sign-up with forged emailVerified and isInviteSignup in the body and an x-invite-signup header creates the user with emailVerified: false", async () => {
    const invitation = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.admin.id,
      email: "gosc@a.example",
      role: "member",
      expiresAt: IN_A_DAY,
    });
    const { auth } = await import("@/shared/lib/auth");

    await auth.api.signUpEmail({
      body: {
        name: "Gość",
        email: "gosc@a.example",
        password: "password-123456",
        invitationId: invitation.id,
        emailVerified: true,
        isInviteSignup: true,
      } as { name: string; email: string; password: string },
      headers: new Headers({ "x-invite-signup": "1" }),
    });

    const newUser = await prisma.user.findUniqueOrThrow({
      where: { email: "gosc@a.example" },
      select: { emailVerified: true },
    });
    expect(newUser).toEqual({ emailVerified: false });
  });
});
