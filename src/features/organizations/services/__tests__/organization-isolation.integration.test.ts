import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { currentSession, readMockedSession } = vi.hoisted(() => {
  const currentSession = {
    value: null as null | {
      user: { id: string; role: string };
      session: { id: string; activeOrganizationId: string | null };
    },
  };
  async function readMockedSession(args?: {
    query?: { disableCookieCache?: boolean };
  }) {
    const cached = currentSession.value;
    if (!cached || !args?.query?.disableCookieCache) {
      return cached;
    }
    const { readActiveOrganizationId } =
      await import("@/test/integration/database");
    return {
      user: cached.user,
      session: {
        ...cached.session,
        activeOrganizationId: await readActiveOrganizationId(cached.session.id),
      },
    };
  }
  return { currentSession, readMockedSession };
});

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(readMockedSession) } },
}));

import { prisma } from "@/shared/lib/prisma";
import {
  getOrgContext,
  NoOrganizationError,
} from "@/shared/lib/auth/org-context";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { getUserAccountsQuery } from "@/features/users/services/queries/user-account-queries";
import { getOrganizationMembersQuery } from "../queries/organization-queries";
import { getDefaultActiveOrganizationId } from "../queries/default-organization-query";
import { resolveSignupMembership } from "../signup-membership";
import { joinOrganizationCommand } from "../commands/member-commands";
import { enterOrganizationCommand } from "../commands/enter-organization-command";
import { getSwitchableOrganizationsQuery } from "../queries/switchable-organizations-query";
import {
  createInvitation,
  createOrganization,
  createSession,
  createUser,
  readActiveOrganizationId,
  resetDatabase,
} from "@/test/integration/database";

const IN_A_DAY = new Date(Date.now() + 24 * 60 * 60 * 1000);
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);

interface World {
  alice: { id: string };
  bob: { id: string };
  carol: { id: string };
  admin: { id: string };
  orgA: { id: string };
  orgB: { id: string };
  invitationA: { id: string };
  invitationB: { id: string };
}

let world: World;

async function signInAs(
  user: { id: string },
  organization: { id: string } | null,
  role = "user",
): Promise<{ id: string }> {
  const activeOrganizationId = organization?.id ?? null;
  const session = await createSession({
    userId: user.id,
    activeOrganizationId,
  });
  currentSession.value = {
    user: { id: user.id, role },
    session: { id: session.id, activeOrganizationId },
  };
  return session;
}

beforeEach(async () => {
  await resetDatabase();
  currentSession.value = null;
  const alice = await createUser({ email: "alice@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  const carol = await createUser({ email: "carol@a.example" });
  const admin = await createUser({ email: "admin@a.example", role: "admin" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [
      { userId: alice.id, role: "owner" },
      { userId: carol.id, role: "member" },
      { userId: admin.id, role: "admin" },
    ],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "owner" }],
  });
  const invitationA = await createInvitation({
    organizationId: orgA.id,
    inviterId: alice.id,
    email: "new-a@example.com",
    expiresAt: IN_A_DAY,
  });
  await createInvitation({
    organizationId: orgA.id,
    inviterId: alice.id,
    email: "done-a@example.com",
    status: "accepted",
    expiresAt: IN_A_DAY,
  });
  const invitationB = await createInvitation({
    organizationId: orgB.id,
    inviterId: bob.id,
    email: "new-b@example.com",
    role: "admin",
    expiresAt: IN_A_DAY,
  });
  world = { alice, bob, carol, admin, orgA, orgB, invitationA, invitationB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("izolacja organizacji na prawdziwej bazie", () => {
  it("lista członków organizacji A zawiera tylko jej członków i oczekujące zaproszenia", async () => {
    await signInAs(world.alice, world.orgA);

    const data = await getOrganizationMembersQuery();

    expect(data.organizationName).toBe("Org A");
    expect(data.members.map((member) => member.email).sort()).toEqual([
      "admin@a.example",
      "alice@a.example",
      "carol@a.example",
    ]);
    expect(data.invitations.map((invitation) => invitation.email)).toEqual([
      "new-a@example.com",
    ]);
  });

  it("lista członków organizacji B nie widzi niczego z organizacji A", async () => {
    await signInAs(world.bob, world.orgB);

    const data = await getOrganizationMembersQuery();

    expect(data.members.map((member) => member.email)).toEqual([
      "bob@b.example",
    ]);
    expect(data.invitations.map((invitation) => invitation.email)).toEqual([
      "new-b@example.com",
    ]);
  });

  it("aktywna organizacja, do której użytkownik nie należy → NoOrganizationError", async () => {
    await signInAs(world.alice, world.orgB);

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
    await expect(getOrganizationMembersQuery()).rejects.toBeInstanceOf(
      NoOrganizationError,
    );
  });

  it("rola w kontekście pochodzi z członkostwa w aktywnej organizacji", async () => {
    await signInAs(world.admin, world.orgA, "admin");

    await expect(getOrgContext()).resolves.toEqual({
      userId: world.admin.id,
      organizationId: world.orgA.id,
      orgRole: "admin",
      userRole: "admin",
      serviceMode: false,
    });
  });

  it("MULTI_ORG=false: członek bez roli globalnej nie dostaje modułu users", async () => {
    await signInAs(world.carol, world.orgA);

    await expect(requireModuleAccess("users")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("MULTI_ORG=false: owner organizacji bez roli globalnej nie dostaje modułu users", async () => {
    await signInAs(world.alice, world.orgA);

    await expect(requireModuleAccess("users")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("lista wszystkich kont tylko dla globalnego admina", async () => {
    await signInAs(world.alice, world.orgA);
    await expect(getUserAccountsQuery()).rejects.toThrow("NEXT_NOT_FOUND");

    await signInAs(world.admin, world.orgA, "admin");
    const accounts = await getUserAccountsQuery();
    expect(accounts).toHaveLength(4);
  });

  it("domyślna aktywna organizacja to najstarsze członkostwo", async () => {
    await prisma.member.create({
      data: {
        organizationId: world.orgB.id,
        userId: world.carol.id,
        role: "member",
        createdAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });

    await expect(getDefaultActiveOrganizationId(world.carol.id)).resolves.toBe(
      world.orgA.id,
    );
    await expect(
      getDefaultActiveOrganizationId("missing-user"),
    ).resolves.toBeNull();
  });

  it("starsze członkostwo zapisane później nadal wygrywa", async () => {
    await prisma.member.create({
      data: {
        organizationId: world.orgB.id,
        userId: world.carol.id,
        role: "member",
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    await expect(getDefaultActiveOrganizationId(world.carol.id)).resolves.toBe(
      world.orgB.id,
    );
  });

  it("globalny admin dostaje moduł users z kontekstem aktywnej organizacji", async () => {
    await signInAs(world.admin, world.orgA, "admin");

    await expect(requireModuleAccess("users")).resolves.toMatchObject({
      userId: world.admin.id,
      organizationId: world.orgA.id,
    });
  });

  it("lista kont zwraca tylko jawnie wybrane pola", async () => {
    await signInAs(world.admin, world.orgA, "admin");

    const [account] = await getUserAccountsQuery();

    expect(Object.keys(account ?? {}).sort()).toEqual([
      "createdAt",
      "email",
      "emailVerified",
      "id",
      "name",
      "role",
    ]);
  });
});

describe("rejestracja z zaproszeniem na prawdziwej bazie", () => {
  it("zaproszenie z organizacji B z cudzym emailem → 403", async () => {
    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: world.invitationB.id,
        userName: "Mallory",
        email: "new-a@example.com",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("zaproszenie z organizacji B z jego emailem w innej wielkości liter → dołączenie do B z rolą z zaproszenia", async () => {
    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: world.invitationB.id,
        userName: "Nowy",
        email: "NEW-B@Example.com",
      }),
    ).resolves.toEqual({
      action: "join",
      organizationId: world.orgB.id,
      role: "admin",
      invitationId: world.invitationB.id,
    });
  });

  it("zaproszenie bez emaila w body → 403, nawet gdy id jest poprawne", async () => {
    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: world.invitationB.id,
        userName: "Mallory",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("MULTI_ORG=false bez zaproszenia → najstarsza organizacja, nawet zapisana później", async () => {
    const oldest = await createOrganization({
      name: "Org Old",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      members: [],
    });

    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: null,
        userName: "Public",
        email: "public@example.com",
      }),
    ).resolves.toEqual({
      action: "join",
      organizationId: oldest.id,
      role: "member",
    });
  });

  it("wygasłe zaproszenie → 403", async () => {
    const expired = await createInvitation({
      organizationId: world.orgA.id,
      inviterId: world.alice.id,
      email: "late@example.com",
      expiresAt: YESTERDAY,
    });

    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: expired.id,
        userName: "Late",
        email: "late@example.com",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("zaakceptowane zaproszenie nie działa drugi raz", async () => {
    const newcomer = await createUser({ email: "new-a@example.com" });
    await joinOrganizationCommand({
      userId: newcomer.id,
      organizationId: world.orgA.id,
      role: "member",
      invitationId: world.invitationA.id,
    });

    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: world.invitationA.id,
        userName: "Again",
        email: "new-a@example.com",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("MULTI_ORG=false bez zaproszenia → dołączenie do najstarszej organizacji jako member", async () => {
    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: null,
        userName: "Public",
        email: "public@example.com",
      }),
    ).resolves.toEqual({
      action: "join",
      organizationId: world.orgA.id,
      role: "member",
    });
  });
});

describe("dołączanie do organizacji: atomowość i współbieżność", () => {
  it("dołączenie z zaproszeniem zapisuje członkostwo i akceptuje zaproszenie razem", async () => {
    const newcomer = await createUser({ email: "new-a@example.com" });

    await joinOrganizationCommand({
      userId: newcomer.id,
      organizationId: world.orgA.id,
      role: "member",
      invitationId: world.invitationA.id,
    });

    await expect(
      prisma.member.count({
        where: { organizationId: world.orgA.id, userId: newcomer.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.invitation.findUniqueOrThrow({
        where: { id: world.invitationA.id },
      }),
    ).resolves.toMatchObject({ status: "accepted" });
  });

  it("nieistniejące zaproszenie → brak członkostwa (rollback transakcji)", async () => {
    const newcomer = await createUser({ email: "ghost@example.com" });

    await expect(
      joinOrganizationCommand({
        userId: newcomer.id,
        organizationId: world.orgA.id,
        role: "member",
        invitationId: "missing-invitation",
      }),
    ).rejects.toThrow();
    await expect(
      prisma.member.count({ where: { userId: newcomer.id } }),
    ).resolves.toBe(0);
  });

  it("dwa równoległe dołączenia tego samego użytkownika → jedno członkostwo", async () => {
    const newcomer = await createUser({ email: "twice@example.com" });
    const join = () =>
      joinOrganizationCommand({
        userId: newcomer.id,
        organizationId: world.orgA.id,
        role: "member",
      });

    const results = await Promise.allSettled([join(), join()]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    await expect(
      prisma.member.count({
        where: { organizationId: world.orgA.id, userId: newcomer.id },
      }),
    ).resolves.toBe(1);
  });
});

const ACCESS_DENIED = { success: false, error: "Brak dostępu do organizacji" };

async function createSuperadmin(): Promise<{ id: string }> {
  return createUser({ email: "serwis@webamigos.example", role: "superadmin" });
}

describe("superadmin wchodzi do organizacji na prawdziwej bazie", () => {
  it("superadmin bez członkostwa wchodzi do B → sesja w bazie wskazuje B, a lista członków to członkowie B", async () => {
    const superadmin = await createSuperadmin();
    const session = await signInAs(superadmin, world.orgA, "superadmin");

    await expect(
      enterOrganizationCommand(world.orgB.id),
    ).resolves.toMatchObject({ success: true });

    await expect(readActiveOrganizationId(session.id)).resolves.toBe(
      world.orgB.id,
    );
    const data = await getOrganizationMembersQuery();
    expect(data.organizationName).toBe("Org B");
    expect(data.members.map((member) => member.email)).toEqual([
      "bob@b.example",
    ]);
    expect(data.invitations.map((invitation) => invitation.email)).toEqual([
      "new-b@example.com",
    ]);
  });

  it("cookie cache trzyma jeszcze A → getOrgContext superadmina od razu zwraca B w trybie serwisowym", async () => {
    const superadmin = await createSuperadmin();
    await signInAs(superadmin, world.orgA, "superadmin");

    await enterOrganizationCommand(world.orgB.id);

    expect(currentSession.value?.session.activeOrganizationId).toBe(
      world.orgA.id,
    );
    await expect(getOrgContext()).resolves.toEqual({
      userId: superadmin.id,
      organizationId: world.orgB.id,
      orgRole: "owner",
      userRole: "superadmin",
      serviceMode: true,
    });
  });

  it("wejście superadmina zmienia tylko jego sesję", async () => {
    const aliceSession = await signInAs(world.alice, world.orgA);
    const superadmin = await createSuperadmin();
    await signInAs(superadmin, world.orgA, "superadmin");

    await enterOrganizationCommand(world.orgB.id);

    await expect(readActiveOrganizationId(aliceSession.id)).resolves.toBe(
      world.orgA.id,
    );
  });

  it("owner organizacji A podaje id B ręcznie → odmowa, sesja bez zmian", async () => {
    const session = await signInAs(world.alice, world.orgA);

    await expect(enterOrganizationCommand(world.orgB.id)).resolves.toEqual(
      ACCESS_DENIED,
    );

    await expect(readActiveOrganizationId(session.id)).resolves.toBe(
      world.orgA.id,
    );
    await expect(getOrgContext()).resolves.toMatchObject({
      organizationId: world.orgA.id,
      serviceMode: false,
    });
  });

  it("globalny admin bez członkostwa w B → odmowa, sesja bez zmian", async () => {
    const session = await signInAs(world.admin, world.orgA, "admin");

    await expect(enterOrganizationCommand(world.orgB.id)).resolves.toEqual(
      ACCESS_DENIED,
    );

    await expect(readActiveOrganizationId(session.id)).resolves.toBe(
      world.orgA.id,
    );
  });

  it("superadmin → nieistniejąca organizacja → odmowa, sesja bez zmian", async () => {
    const superadmin = await createSuperadmin();
    const session = await signInAs(superadmin, world.orgA, "superadmin");

    await expect(enterOrganizationCommand("nie-istnieje")).resolves.toEqual(
      ACCESS_DENIED,
    );

    await expect(readActiveOrganizationId(session.id)).resolves.toBe(
      world.orgA.id,
    );
  });

  it("członek obu organizacji przełącza się na B", async () => {
    await prisma.member.create({
      data: {
        organizationId: world.orgB.id,
        userId: world.carol.id,
        role: "member",
      },
    });
    const session = await signInAs(world.carol, world.orgA);

    await expect(
      enterOrganizationCommand(world.orgB.id),
    ).resolves.toMatchObject({ success: true });

    await expect(readActiveOrganizationId(session.id)).resolves.toBe(
      world.orgB.id,
    );
  });

  it("członek A i B przełącza się na B, a cookie cache trzyma A → getOrgContext od razu zwraca B bez trybu serwisowego", async () => {
    await prisma.member.create({
      data: {
        organizationId: world.orgB.id,
        userId: world.carol.id,
        role: "admin",
      },
    });
    await signInAs(world.carol, world.orgA);
    await expect(getOrgContext()).resolves.toMatchObject({
      organizationId: world.orgA.id,
    });

    await expect(
      enterOrganizationCommand(world.orgB.id),
    ).resolves.toMatchObject({ success: true });

    expect(currentSession.value?.session.activeOrganizationId).toBe(
      world.orgA.id,
    );
    await expect(getOrgContext()).resolves.toEqual({
      userId: world.carol.id,
      organizationId: world.orgB.id,
      orgRole: "admin",
      userRole: "user",
      serviceMode: false,
    });
    const data = await getOrganizationMembersQuery();
    expect(data.organizationName).toBe("Org B");
  });

  it("superadmin z aktywną organizacją, której nie ma w bazie → NoOrganizationError", async () => {
    const superadmin = await createSuperadmin();
    await signInAs(superadmin, { id: "nie-istnieje" }, "superadmin");

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
    await expect(getOrganizationMembersQuery()).rejects.toBeInstanceOf(
      NoOrganizationError,
    );
  });

  it("superadmin bez aktywnej organizacji → NoOrganizationError, nigdy dane wszystkich organizacji", async () => {
    const superadmin = await createSuperadmin();
    await signInAs(superadmin, null, "superadmin");

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
    await expect(getOrganizationMembersQuery()).rejects.toBeInstanceOf(
      NoOrganizationError,
    );
  });

  it("superadmin z członkostwem w B → zwykły kontekst członka", async () => {
    const superadmin = await createSuperadmin();
    await prisma.member.create({
      data: {
        organizationId: world.orgB.id,
        userId: superadmin.id,
        role: "admin",
      },
    });
    await signInAs(superadmin, world.orgB, "superadmin");

    await expect(getOrgContext()).resolves.toEqual({
      userId: superadmin.id,
      organizationId: world.orgB.id,
      orgRole: "admin",
      userRole: "superadmin",
      serviceMode: false,
    });
  });
});

describe("organizacje do przełączenia na prawdziwej bazie", () => {
  it("superadmin widzi wszystkie organizacje po nazwie z oznaczeniem członkostwa", async () => {
    const superadmin = await createSuperadmin();
    await prisma.member.create({
      data: {
        organizationId: world.orgB.id,
        userId: superadmin.id,
        role: "member",
      },
    });
    const orgC = await createOrganization({
      name: "Org C",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      members: [],
    });
    await signInAs(superadmin, null, "superadmin");

    await expect(getSwitchableOrganizationsQuery()).resolves.toEqual([
      { id: world.orgA.id, name: "Org A", isMember: false },
      { id: world.orgB.id, name: "Org B", isMember: true },
      { id: orgC.id, name: "Org C", isMember: false },
    ]);
  });

  it("członek widzi tylko swoje organizacje", async () => {
    await signInAs(world.carol, world.orgA);

    await expect(getSwitchableOrganizationsQuery()).resolves.toEqual([
      { id: world.orgA.id, name: "Org A", isMember: true },
    ]);
  });

  it("globalny admin widzi tylko swoje organizacje", async () => {
    await signInAs(world.admin, world.orgA, "admin");

    await expect(getSwitchableOrganizationsQuery()).resolves.toEqual([
      { id: world.orgA.id, name: "Org A", isMember: true },
    ]);
  });
});

describe("domyślna organizacja superadmina na prawdziwej bazie", () => {
  it("superadmin bez członkostwa → najstarsza organizacja, nawet zapisana później", async () => {
    const superadmin = await createSuperadmin();
    const oldest = await createOrganization({
      name: "Org Old",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      members: [],
    });

    await expect(getDefaultActiveOrganizationId(superadmin.id)).resolves.toBe(
      oldest.id,
    );
  });

  it("superadmin z członkostwem → organizacja z członkostwa, nie najstarsza", async () => {
    const superadmin = await createSuperadmin();
    await prisma.member.create({
      data: {
        organizationId: world.orgB.id,
        userId: superadmin.id,
        role: "member",
      },
    });

    await expect(getDefaultActiveOrganizationId(superadmin.id)).resolves.toBe(
      world.orgB.id,
    );
  });

  it("globalny admin bez członkostwa → null", async () => {
    const outsiderAdmin = await createUser({
      email: "admin@klient.example",
      role: "admin",
    });

    await expect(
      getDefaultActiveOrganizationId(outsiderAdmin.id),
    ).resolves.toBeNull();
  });
});
