import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    organization: { findFirst: vi.fn(), create: vi.fn() },
    invitation: { findFirst: vi.fn(), update: vi.fn() },
    member: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/modules.generated", () => ({
  auditSinks: [],
  moduleEvents: [],
  moduleSubscribers: [],
}));

import {
  applySignupMembership,
  resolveSignupMembership,
} from "../signup-membership";

async function seedOrg(name: string) {
  const org = { id: `org-${name.toLowerCase()}`, name };
  mockPrisma.organization.findFirst.mockResolvedValue(org);
  return org;
}

describe("resolveSignupMembership", () => {
  beforeEach(() => {
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    mockPrisma.invitation.findFirst.mockResolvedValue(null);
  });

  it("MULTI_ORG=false bez organizacji → błąd konfiguracji", async () => {
    await expect(
      resolveSignupMembership({
        multiOrg: false,
        invitationId: null,
        userName: "Ala",
      }),
    ).rejects.toThrow(
      "Aplikacja nie jest skonfigurowana: uruchom npm run admin:create",
    );
  });

  it("MULTI_ORG=false dołącza do jedynej organizacji jako member", async () => {
    const org = await seedOrg("Firma");
    expect(
      await resolveSignupMembership({
        multiOrg: false,
        invitationId: null,
        userName: "Ala",
      }),
    ).toEqual({ action: "join", organizationId: org.id, role: "member" });
    expect(mockPrisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } }),
    );
  });

  it("MULTI_ORG=true bez zaproszenia tworzy organizację jako owner", async () => {
    expect(
      await resolveSignupMembership({
        multiOrg: true,
        invitationId: null,
        userName: "Ala",
      }),
    ).toEqual({
      action: "create",
      organizationName: "Ala — organizacja",
      role: "owner",
    });
    expect(mockPrisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "zaproszenie (MULTI_ORG=%s) → join organizacji zaproszenia z rolą z zaproszenia",
    async (multiOrg) => {
      mockPrisma.invitation.findFirst.mockResolvedValue({
        id: "inv-1",
        organizationId: "org-invited",
        role: "admin",
      });

      expect(
        await resolveSignupMembership({
          multiOrg,
          invitationId: "inv-1",
          userName: "Ala",
          email: "Ala@Example.com",
        }),
      ).toEqual({
        action: "join",
        organizationId: "org-invited",
        role: "admin",
        invitationId: "inv-1",
      });

      const { where } = mockPrisma.invitation.findFirst.mock.calls[0][0];
      expect(where).toMatchObject({
        id: "inv-1",
        email: { equals: "Ala@Example.com", mode: "insensitive" },
        status: "pending",
      });
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
    },
  );

  it("nieznana rola w zaproszeniu → member", async () => {
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-invited",
      role: "superuser",
    });

    expect(
      await resolveSignupMembership({
        multiOrg: true,
        invitationId: "inv-1",
        userName: "Ala",
        email: "ala@example.com",
      }),
    ).toMatchObject({ action: "join", role: "member" });
  });

  it("nieważne zaproszenie → odrzuca rejestrację", async () => {
    await expect(
      resolveSignupMembership({
        multiOrg: true,
        invitationId: "inv-x",
        userName: "Ala",
        email: "ala@example.com",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("zaproszenie bez emaila → odrzuca bez zapytania do bazy", async () => {
    await expect(
      resolveSignupMembership({
        multiOrg: true,
        invitationId: "inv-1",
        userName: "Ala",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.invitation.findFirst).not.toHaveBeenCalled();
  });
});

describe("applySignupMembership", () => {
  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
    mockPrisma.member.create.mockImplementation((args: unknown) => ({
      op: "member.create",
      args,
    }));
    mockPrisma.invitation.update.mockImplementation((args: unknown) => ({
      op: "invitation.update",
      args,
    }));
    mockPrisma.organization.create.mockResolvedValue({
      id: "org-new",
      slug: "ala-organizacja-abcd1234",
    });
  });

  it("create returns the id of the new organization", async () => {
    await expect(
      applySignupMembership("user-1", {
        action: "create",
        organizationName: "Ala — organizacja",
        role: "owner",
      }),
    ).resolves.toStrictEqual({ organizationId: "org-new" });
  });

  it("join with an invitation returns the organization of the membership", async () => {
    await expect(
      applySignupMembership("user-1", {
        action: "join",
        organizationId: "org-invited",
        role: "admin",
        invitationId: "inv-1",
      }),
    ).resolves.toStrictEqual({ organizationId: "org-invited" });
  });

  it("join without an invitation returns the organization of the membership", async () => {
    await expect(
      applySignupMembership("user-1", {
        action: "join",
        organizationId: "org-only",
        role: "member",
      }),
    ).resolves.toStrictEqual({ organizationId: "org-only" });
  });

  it("a failing create rejects instead of returning an organization", async () => {
    mockPrisma.organization.create.mockRejectedValue(new Error("db down"));

    await expect(
      applySignupMembership("user-1", {
        action: "create",
        organizationName: "Ala — organizacja",
        role: "owner",
      }),
    ).rejects.toThrow("db down");
  });

  it("join z zaproszeniem dodaje członka i oznacza zaproszenie jako przyjęte", async () => {
    await applySignupMembership("user-1", {
      action: "join",
      organizationId: "org-1",
      role: "admin",
      invitationId: "inv-1",
    });

    expect(mockPrisma.member.create).toHaveBeenCalledWith({
      data: { organizationId: "org-1", userId: "user-1", role: "admin" },
    });
    expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "accepted" },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("join bez zaproszenia nie dotyka zaproszeń", async () => {
    await applySignupMembership("user-1", {
      action: "join",
      organizationId: "org-1",
      role: "member",
    });

    expect(mockPrisma.member.create).toHaveBeenCalledWith({
      data: { organizationId: "org-1", userId: "user-1", role: "member" },
    });
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
  });

  it("create zakłada organizację z użytkownikiem jako owner", async () => {
    await applySignupMembership("user-1", {
      action: "create",
      organizationName: "Ala — organizacja",
      role: "owner",
    });

    const { data } = mockPrisma.organization.create.mock.calls[0][0];
    expect(data.name).toBe("Ala — organizacja");
    expect(data.slug).toMatch(/^ala-organizacja-[a-z0-9]{8}$/);
    expect(data.members).toEqual({
      create: { userId: "user-1", role: "owner" },
    });
  });
});
