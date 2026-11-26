import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeSignedCookie } from "better-call";
import type { AuditEvent } from "@/shared/lib/audit";
import type { RegisteredCommandHook } from "@/shared/lib/commands/define-command";
import type { DomainEvent } from "@/shared/lib/events";

const {
  recordedEvents,
  currentHeaders,
  domainEvents,
  subscriberEntries,
  hookStore,
} = vi.hoisted(() => ({
  recordedEvents: [] as AuditEvent[],
  currentHeaders: { value: new Headers() },
  domainEvents: [] as DomainEvent[],
  subscriberEntries: [] as { module: string; value: unknown }[],
  hookStore: { entries: [] as RegisteredCommandHook[] },
}));

vi.mock("@/modules.generated", async () => ({
  env: (await import("@gatojs/env")).createEnv([]),
  authPlugins: [],
  moduleCommandHooks: hookStore.entries,
  moduleEvents: [],
  auditSinks: [
    async (event: AuditEvent) => {
      recordedEvents.push(event);
    },
  ],
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

// WHY: importing audit.ts before modules.generated binds it to the mocked auditSinks
// (the modules.generated -> audit-logs -> audit.ts cycle would bind the original list).
import "@/shared/lib/audit";
import { prisma } from "@/shared/lib/prisma";
import { DomainError } from "@/shared/utils/error-handling";
import { inviteUserCommand } from "../invite-user-command";
import {
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
}

subscriberEntries.push({
  module: "probe",
  value: {
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
  ownerB: { id: string };
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

function registerHook(before: RegisteredCommandHook["hook"]["before"]): void {
  hookStore.entries.push({
    module: "dashboard",
    command: "users.invite",
    hook: { id: "dashboard.invite-policy", before },
  });
}

const NEW_MEMBER = {
  name: "Nowy Użytkownik",
  email: "nowy@a.example",
  role: "member" as const,
};

beforeEach(async () => {
  recordedEvents.length = 0;
  domainEvents.length = 0;
  hookStore.entries.length = 0;
  currentHeaders.value = new Headers();
  await resetDatabase();
  const admin = await createUser({ email: "admin@a.example", role: "admin" });
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
  world = { admin, ownerB, orgA, orgB };
  await signInAs(admin.id, orgA.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("users.invite with before hooks on real Postgres, two organizations", () => {
  it("a hook pointing organizationId at B with A's admin session invites into A only", async () => {
    registerHook((input) => ({ ...input, organizationId: world.orgB.id }));

    const result = await inviteUserCommand(NEW_MEMBER);

    expect(result.success).toBe(true);
    const invitations = await prisma.invitation.findMany({
      where: { email: "nowy@a.example" },
      select: { organizationId: true, inviterId: true },
    });
    expect(invitations).toEqual([
      { organizationId: world.orgA.id, inviterId: world.admin.id },
    ]);
    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email: "nowy@a.example" },
      select: { id: true },
    });
    const memberships = await prisma.member.findMany({
      where: { userId: invitedUser.id },
      select: { organizationId: true },
    });
    expect(memberships).toEqual([{ organizationId: world.orgA.id }]);
    expect(
      await prisma.invitation.count({
        where: { organizationId: world.orgB.id },
      }),
    ).toBe(0);
    const membersOfB = await prisma.member.findMany({
      where: { organizationId: world.orgB.id },
      select: { userId: true },
    });
    expect(membersOfB).toEqual([{ userId: world.ownerB.id }]);
    expect(domainEvents.map((event) => event.organizationId)).toEqual([
      world.orgA.id,
    ]);
  });

  it("a hook raising the role to admin writes an admin invitation and membership in A", async () => {
    registerHook((input) => ({ ...input, role: "admin" }));

    const result = await inviteUserCommand(NEW_MEMBER);

    expect(result.success).toBe(true);
    const invitations = await prisma.invitation.findMany({
      where: { email: "nowy@a.example" },
      select: { organizationId: true, role: true },
    });
    expect(invitations).toEqual([
      { organizationId: world.orgA.id, role: "admin" },
    ]);
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

  it("a hook vetoing with DomainError leaves no invitation, no user and no member.invited in either organization", async () => {
    registerHook(() => {
      throw new DomainError("Zaproszenia są wstrzymane");
    });

    const result = await inviteUserCommand(NEW_MEMBER);

    expect(result).toEqual({
      success: false,
      error: "Zaproszenia są wstrzymane",
    });
    expect(await prisma.invitation.count()).toBe(0);
    expect(
      await prisma.user.findUnique({ where: { email: "nowy@a.example" } }),
    ).toBeNull();
    expect(
      recordedEvents.filter((event) => event.action === "member.invited"),
    ).toEqual([]);
    expect(domainEvents).toEqual([]);
  });

  it.skipIf(!hasAuditLogs)(
    "without a veto the same invite writes one member.invited in A, so the veto assertion is not vacuous",
    async () => {
      registerHook(() => undefined);

      await inviteUserCommand(NEW_MEMBER);

      const invited = recordedEvents.filter(
        (event) => event.action === "member.invited",
      );
      expect(invited.map((event) => event.organizationId)).toEqual([
        world.orgA.id,
      ]);
    },
  );
});
