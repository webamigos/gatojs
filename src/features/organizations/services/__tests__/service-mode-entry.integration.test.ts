import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/shared/lib/audit";

const { recordedEvents, sinkBehaviour } = vi.hoisted(() => ({
  recordedEvents: [] as AuditEvent[],
  sinkBehaviour: { fail: false },
}));

vi.mock("@/modules.generated", async () => ({
  env: (await import("@gatojs/env")).createEnv([]),
  authPlugins: [],
  auditSinks: [
    async (event: AuditEvent) => {
      if (sinkBehaviour.fail) {
        throw new Error("sink down");
      }
      recordedEvents.push(event);
    },
  ],
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/shared/lib/mailer", () => ({
  sendWelcomeSetPasswordEmail: vi.fn(async () => ({ data: null })),
  sendPasswordResetEmail: vi.fn(async () => undefined),
  sendOrganizationInvitationEmail: vi.fn(async () => undefined),
}));

import { auth } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import {
  createOrganization,
  createUser,
  readActiveOrganizationId,
  resetDatabase,
} from "@/test/integration/database";

const OLDER = new Date("2026-01-01T00:00:00.000Z");
const NEWER = new Date("2026-02-01T00:00:00.000Z");

async function signIn(userId: string): Promise<string> {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  return session.id;
}

function enteredEvents(): AuditEvent[] {
  return recordedEvents.filter(
    (event) => event.action === "organization.entered",
  );
}

beforeEach(async () => {
  recordedEvents.length = 0;
  sinkBehaviour.fail = false;
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("organization.entered przy tworzeniu sesji przez better-auth", () => {
  it("superadmin bez członkostw dostaje najstarszą organizację A i jeden wpis organization.entered dla A w trybie serwisowym", async () => {
    const superadmin = await createUser({
      email: "serwis@webamigos.example",
      role: "superadmin",
    });
    const orgA = await createOrganization({
      name: "Org A",
      createdAt: OLDER,
      members: [],
    });
    const orgB = await createOrganization({
      name: "Org B",
      createdAt: NEWER,
      members: [],
    });

    const sessionId = await signIn(superadmin.id);

    expect(await readActiveOrganizationId(sessionId)).toBe(orgA.id);
    expect(enteredEvents()).toHaveLength(1);
    expect(enteredEvents()[0]).toMatchObject({
      organizationId: orgA.id,
      actorUserId: superadmin.id,
      entityType: "organization",
      entityId: orgA.id,
      serviceMode: true,
    });
    expect(
      recordedEvents.filter((event) => event.organizationId === orgB.id),
    ).toEqual([]);
  });

  it("superadmin z członkostwem w B (A starsza) dostaje B i nie zostawia wpisu", async () => {
    const superadmin = await createUser({
      email: "serwis@webamigos.example",
      role: "superadmin",
    });
    await createOrganization({ name: "Org A", createdAt: OLDER, members: [] });
    const orgB = await createOrganization({
      name: "Org B",
      createdAt: NEWER,
      members: [{ userId: superadmin.id, role: "owner" }],
    });

    const sessionId = await signIn(superadmin.id);

    expect(await readActiveOrganizationId(sessionId)).toBe(orgB.id);
    expect(enteredEvents()).toEqual([]);
  });

  it("zwykły użytkownik z członkostwem w A nie zostawia wpisu", async () => {
    const alice = await createUser({ email: "alice@a.example" });
    const orgA = await createOrganization({
      name: "Org A",
      createdAt: OLDER,
      members: [{ userId: alice.id, role: "member" }],
    });

    const sessionId = await signIn(alice.id);

    expect(await readActiveOrganizationId(sessionId)).toBe(orgA.id);
    expect(enteredEvents()).toEqual([]);
  });

  it("awaria ujścia audytu nie blokuje utworzenia sesji superadmina", async () => {
    const superadmin = await createUser({
      email: "serwis@webamigos.example",
      role: "superadmin",
    });
    const orgA = await createOrganization({
      name: "Org A",
      createdAt: OLDER,
      members: [],
    });
    sinkBehaviour.fail = true;

    const sessionId = await signIn(superadmin.id);

    expect(await readActiveOrganizationId(sessionId)).toBe(orgA.id);
    expect(
      await prisma.session.count({ where: { userId: superadmin.id } }),
    ).toBe(1);
  });
});
