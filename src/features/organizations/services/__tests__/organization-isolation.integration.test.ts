import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { currentSession } = vi.hoisted(() => ({
  currentSession: {
    value: null as null | {
      user: { id: string; role: string };
      session: { activeOrganizationId: string | null };
    },
  },
}));

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
  auth: { api: { getSession: vi.fn(async () => currentSession.value) } },
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
import {
  createInvitation,
  createOrganization,
  createUser,
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

function signInAs(
  user: { id: string },
  organization: { id: string } | null,
  role = "user",
) {
  currentSession.value = {
    user: { id: user.id, role },
    session: { activeOrganizationId: organization?.id ?? null },
  };
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
    signInAs(world.alice, world.orgA);

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
    signInAs(world.bob, world.orgB);

    const data = await getOrganizationMembersQuery();

    expect(data.members.map((member) => member.email)).toEqual([
      "bob@b.example",
    ]);
    expect(data.invitations.map((invitation) => invitation.email)).toEqual([
      "new-b@example.com",
    ]);
  });

  it("aktywna organizacja, do której użytkownik nie należy → NoOrganizationError", async () => {
    signInAs(world.alice, world.orgB);

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
    await expect(getOrganizationMembersQuery()).rejects.toBeInstanceOf(
      NoOrganizationError,
    );
  });

  it("rola w kontekście pochodzi z członkostwa w aktywnej organizacji", async () => {
    signInAs(world.admin, world.orgA, "admin");

    await expect(getOrgContext()).resolves.toEqual({
      userId: world.admin.id,
      organizationId: world.orgA.id,
      orgRole: "admin",
      userRole: "admin",
    });
  });

  it("MULTI_ORG=false: członek bez roli globalnej nie dostaje modułu users", async () => {
    signInAs(world.carol, world.orgA);

    await expect(requireModuleAccess("users")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("MULTI_ORG=false: owner organizacji bez roli globalnej nie dostaje modułu users", async () => {
    signInAs(world.alice, world.orgA);

    await expect(requireModuleAccess("users")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("lista wszystkich kont tylko dla globalnego admina", async () => {
    signInAs(world.alice, world.orgA);
    await expect(getUserAccountsQuery()).rejects.toThrow("NEXT_NOT_FOUND");

    signInAs(world.admin, world.orgA, "admin");
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
    signInAs(world.admin, world.orgA, "admin");

    await expect(requireModuleAccess("users")).resolves.toMatchObject({
      userId: world.admin.id,
      organizationId: world.orgA.id,
    });
  });

  it("lista kont zwraca tylko jawnie wybrane pola", async () => {
    signInAs(world.admin, world.orgA, "admin");

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
