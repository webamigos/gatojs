import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeSignedCookie } from "better-call";
import type { AuditEvent } from "@/shared/lib/audit";

const { recordedEvents, currentHeaders } = vi.hoisted(() => ({
  recordedEvents: [] as AuditEvent[],
  currentHeaders: { value: new Headers() },
}));

vi.mock("@/modules.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.generated")>()),
  auditSinks: [
    async (event: AuditEvent) => {
      recordedEvents.push(event);
    },
  ],
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
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

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

beforeEach(async () => {
  recordedEvents.length = 0;
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

describe("inviteUserCommand na prawdziwym better-auth: dziennik zdarzeń", () => {
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
      recordedEvents.filter((event) => event.organizationId === world.orgB.id),
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
});
