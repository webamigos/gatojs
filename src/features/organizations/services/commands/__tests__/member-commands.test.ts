import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockTrackAudit } = vi.hoisted(() => ({
  mockPrisma: {
    member: { create: vi.fn() },
    invitation: { update: vi.fn() },
    $transaction: vi.fn(),
  },
  mockTrackAudit: vi.fn(),
}));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/audit", () => ({ trackAudit: mockTrackAudit }));

import { joinOrganizationCommand } from "../member-commands";

describe("joinOrganizationCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.member.create.mockResolvedValue({ id: "mem-2" });
    mockPrisma.invitation.update.mockResolvedValue({ id: "inv-1" });
    mockPrisma.$transaction.mockResolvedValue([
      { id: "mem-1" },
      { id: "inv-1" },
    ]);
    mockTrackAudit.mockResolvedValue(undefined);
  });

  it("z invitationId zwraca id zapisanego członka z transakcji", async () => {
    await expect(
      joinOrganizationCommand({
        userId: "user-new",
        organizationId: "org-a",
        role: "member",
        invitationId: "inv-1",
      }),
    ).resolves.toStrictEqual({ memberId: "mem-1" });
  });

  it("z invitationId zapisuje członka i oznacza zaproszenie jako przyjęte w jednej transakcji", async () => {
    await joinOrganizationCommand({
      userId: "user-new",
      organizationId: "org-a",
      role: "member",
      invitationId: "inv-1",
    });

    expect(mockPrisma.member.create).toHaveBeenCalledWith({
      data: { organizationId: "org-a", userId: "user-new", role: "member" },
    });
    expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "accepted" },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("z invitationId nie zapisuje żadnego wpisu dziennika (to zadanie subskrybentów zdarzeń)", async () => {
    await joinOrganizationCommand({
      userId: "user-new",
      organizationId: "org-a",
      role: "member",
      invitationId: "inv-1",
    });

    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("bez invitationId zwraca id członka i nie dotyka zaproszeń", async () => {
    await expect(
      joinOrganizationCommand({
        userId: "user-new",
        organizationId: "org-a",
        role: "member",
      }),
    ).resolves.toStrictEqual({ memberId: "mem-2" });

    expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("awaria transakcji członkostwa odrzuca bez wpisu dziennika", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("db down"));

    await expect(
      joinOrganizationCommand({
        userId: "user-new",
        organizationId: "org-a",
        role: "member",
        invitationId: "inv-1",
      }),
    ).rejects.toThrow("db down");
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("awaria zapisu członka bez zaproszenia odrzuca bez wpisu dziennika", async () => {
    mockPrisma.member.create.mockRejectedValue(new Error("db down"));

    await expect(
      joinOrganizationCommand({
        userId: "user-new",
        organizationId: "org-a",
        role: "member",
      }),
    ).rejects.toThrow("db down");
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });
});
