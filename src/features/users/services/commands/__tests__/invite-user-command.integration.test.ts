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
  "inviteUserCommand na prawdziwym better-auth: dziennik zdarzeń",
  () => {
    it("admin organizacji A zapisuje member.invited ze swoim aktorem i id zaproszenia z bazy, a przyjęcie ma aktora zaproszonego", async () => {
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
      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email: "nowy@a.example" },
        select: { id: true },
      });
      expect(invitation.organizationId).toBe(world.orgA.id);

      const invited = recordedEvents.filter(
        (event) => event.action === "member.invited",
      );
      expect(invited).toHaveLength(1);
      expect(invited[0]).toMatchObject({
        organizationId: world.orgA.id,
        actorUserId: world.admin.id,
        serviceMode: false,
        entityType: "invitation",
        entityId: invitation.id,
        newData: { email: "nowy@a.example", role: "member" },
      });

      const accepted = recordedEvents.filter(
        (event) => event.action === "invitation.accepted",
      );
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toMatchObject({
        organizationId: world.orgA.id,
        actorUserId: invitedUser.id,
      });

      expect(
        recordedEvents.filter(
          (event) => event.organizationId === world.orgB.id,
        ),
      ).toEqual([]);
    });

    it("superadmin bez członkostwa w A, z potwierdzeniem, zapisuje member.invited ze swoim aktorem i serviceMode: true", async () => {
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

    it("superadmin w trybie serwisowym bez potwierdzenia nie tworzy zaproszenia ani wpisu", async () => {
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

describe("inviteUserCommand na prawdziwym better-auth: zdarzenia domenowe", () => {
  it("zaproszenie przez admina organizacji A daje dokładnie users.invited z organizacją A i aktorem admina, bez auth.signed-up", async () => {
    await signInAs(world.admin.id, world.orgA.id);

    const result = await inviteUserCommand({
      name: "Nowy Użytkownik",
      email: "nowy@a.example",
      role: "member",
    });

    expect(result.success).toBe(true);
    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { email: "nowy@a.example" },
      select: { id: true },
    });
    expect(domainEvents.map((event) => event.name)).toEqual(["users.invited"]);
    expect(domainEvents[0]).toEqual({
      name: "users.invited",
      organizationId: world.orgA.id,
      actorUserId: world.admin.id,
      serviceMode: false,
      payload: {
        invitationId: invitation.id,
        email: "nowy@a.example",
        role: "member",
      },
    });
  });

  it("zaproszenie przez admina nadal tworzy członkostwo zaproszonego w organizacji A", async () => {
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

  it("superadmin z potwierdzeniem trybu serwisowego daje dokładnie users.invited ze swoim aktorem", async () => {
    await signInAs(world.superadmin.id, world.orgA.id);

    const result = await inviteUserCommand(
      { name: "Nowy Użytkownik", email: "nowy@a.example", role: "member" },
      { serviceModeConfirmed: true, organizationId: world.orgA.id },
    );

    expect(result.success).toBe(true);
    expect(domainEvents.map((event) => event.name)).toEqual(["users.invited"]);
    expect(domainEvents[0]).toMatchObject({
      organizationId: world.orgA.id,
      actorUserId: world.superadmin.id,
      serviceMode: true,
    });
  });

  it("publiczna rejestracja z zaproszeniem do A (poza zaproszeniem admina) daje dokładnie auth.signed-up z organizacją A i aktorem nowego użytkownika", async () => {
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
    expect(domainEvents.map((event) => event.name)).toEqual(["auth.signed-up"]);
    expect(domainEvents[0]).toEqual({
      name: "auth.signed-up",
      organizationId: world.orgA.id,
      actorUserId: newUser.id,
      serviceMode: false,
      payload: { userId: newUser.id, email: "gosc@a.example" },
    });
  });

  it("publiczna rejestracja z podrobionymi polami inviteSignup, adminInvite i isInviteSignup nadal daje auth.signed-up", async () => {
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
    expect(domainEvents.map((event) => event.name)).toEqual(["auth.signed-up"]);
    expect(domainEvents[0]).toMatchObject({
      organizationId: world.orgA.id,
      actorUserId: newUser.id,
    });
  });
});

async function invitedAuditRows(organizationId: string) {
  return prisma.auditLog.findMany({
    where: { organizationId, action: "member.invited" },
    select: { organizationId: true, newData: true },
    orderBy: { createdAt: "asc" },
  });
}

describe.skipIf(!hasAuditLogs)(
  "inviteUserCommand na prawdziwym better-auth: weryfikacja emaila i wpis member.invited",
  () => {
    it("zaproszony przez admina A ma zweryfikowany email, członkostwo w A i dokładnie jeden wiersz member.invited w A", async () => {
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

    it("po serii zaproszeń w A i B każde członkostwo zaproszonego ma swój wiersz member.invited z jego emailem", async () => {
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

describe("publiczna rejestracja na prawdziwym better-auth: email niezweryfikowany", () => {
  it("publiczna rejestracja z zaproszeniem do A tworzy użytkownika z emailVerified: false", async () => {
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

  it("publiczna rejestracja z podrobionymi emailVerified i isInviteSignup w body oraz nagłówkiem x-invite-signup tworzy użytkownika z emailVerified: false", async () => {
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
