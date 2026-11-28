import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockRedirect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(async () => {
    throw new Error("session must not be read under a request principal");
  }),
  mockRedirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

import { prisma } from "@/shared/lib/prisma";
import {
  getOrgContext,
  NoOrganizationError,
} from "@/shared/lib/auth/org-context";
import {
  runWithRequestPrincipal,
  type RequestPrincipal,
} from "@/shared/lib/auth/request-principal";
import {
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

interface World {
  user: { id: string };
  other: { id: string };
  orgA: { id: string };
  orgB: { id: string };
  orgC: { id: string };
}

let world: World;

function principalFor(organizationId: string): RequestPrincipal {
  return {
    channel: "mcp",
    userId: world.user.id,
    organizationId,
    accountRole: "superadmin",
    credentialId: "client-1",
    scopes: ["mcp:read"],
    correlationId: "corr-1",
  };
}

beforeEach(async () => {
  await resetDatabase();
  const user = await createUser({
    email: "u@example.com",
    role: "superadmin",
  });
  const other = await createUser({ email: "other@example.com" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    members: [{ userId: user.id, role: "admin" }],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-01-02T00:00:00Z"),
    members: [
      { userId: user.id, role: "member" },
      { userId: other.id, role: "owner" },
    ],
  });
  const orgC = await createOrganization({
    name: "Org C",
    createdAt: new Date("2026-01-03T00:00:00Z"),
    members: [{ userId: other.id, role: "owner" }],
  });
  world = { user, other, orgA, orgB, orgC };
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("getOrgContext pod principalem żądania na prawdziwej bazie", () => {
  it("principal dla A → rola admin w A, bez sesji", async () => {
    await expect(
      runWithRequestPrincipal(principalFor(world.orgA.id), () =>
        getOrgContext(),
      ),
    ).resolves.toStrictEqual({
      userId: world.user.id,
      organizationId: world.orgA.id,
      orgRole: "admin",
      userRole: "user",
      serviceMode: false,
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("principal dla B → rola member w B, nie rola z A", async () => {
    await expect(
      runWithRequestPrincipal(principalFor(world.orgB.id), () =>
        getOrgContext(),
      ),
    ).resolves.toStrictEqual({
      userId: world.user.id,
      organizationId: world.orgB.id,
      orgRole: "member",
      userRole: "user",
      serviceMode: false,
    });
  });

  it("principal dla istniejącej organizacji C bez członkostwa → NoOrganizationError, nie tryb serwisowy", async () => {
    await expect(
      runWithRequestPrincipal(principalFor(world.orgC.id), () =>
        getOrgContext(),
      ),
    ).rejects.toBeInstanceOf(NoOrganizationError);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("usunięcie członkostwa w A → następne wywołanie pod tym samym principalem rzuca NoOrganizationError", async () => {
    const principal = principalFor(world.orgA.id);

    const outcome = await runWithRequestPrincipal(principal, async () => {
      const before = await getOrgContext();
      await prisma.member.deleteMany({
        where: { organizationId: world.orgA.id, userId: world.user.id },
      });
      const after = await getOrgContext().catch((error: unknown) => error);
      return { before, after };
    });

    expect(outcome.before.orgRole).toBe("admin");
    expect(outcome.after).toBeInstanceOf(NoOrganizationError);
  });

  it("zmiana roli w A na member → następne wywołanie widzi member", async () => {
    const principal = principalFor(world.orgA.id);

    const roles = await runWithRequestPrincipal(principal, async () => {
      const before = await getOrgContext();
      await prisma.member.updateMany({
        where: { organizationId: world.orgA.id, userId: world.user.id },
        data: { role: "member" },
      });
      const after = await getOrgContext();
      return [before.orgRole, after.orgRole];
    });

    expect(roles).toEqual(["admin", "member"]);
  });

  it("usunięcie członkostwa w A nie zmienia roli w B", async () => {
    await prisma.member.deleteMany({
      where: { organizationId: world.orgA.id, userId: world.user.id },
    });

    await expect(
      runWithRequestPrincipal(principalFor(world.orgB.id), () =>
        getOrgContext(),
      ),
    ).resolves.toMatchObject({
      organizationId: world.orgB.id,
      orgRole: "member",
    });
  });
});
