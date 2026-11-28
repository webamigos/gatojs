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
    mockPrisma.member.create.mockResolvedValue({ id: "mem-1" });
    mockPrisma.invitation.update.mockResolvedValue({ id: "inv-1" });
    mockPrisma.$transaction.mockResolvedValue([]);
    mockTrackAudit.mockResolvedValue(undefined);
  });

  it("z invitationId zapisuje jeden wpis invitation.accepted dla dołączającego", async () => {
    await joinOrganizationCommand({
      userId: "user-new",
      organizationId: "org-a",
      role: "member",
      invitationId: "inv-1",
    });

    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit).toHaveBeenCalledWith({
      organizationId: "org-a",
      actorUserId: "user-new",
      action: "invitation.accepted",
      entityType: "invitation",
      entityId: "inv-1",
    });
  });

  it("wpis powstaje dopiero po zapisie członkostwa", async () => {
    const order: string[] = [];
    mockPrisma.$transaction.mockImplementation(async () => {
      order.push("transaction");
      return [];
    });
    mockTrackAudit.mockImplementation(async () => {
      order.push("audit");
    });

    await joinOrganizationCommand({
      userId: "user-new",
      organizationId: "org-a",
      role: "member",
      invitationId: "inv-1",
    });

    expect(order).toEqual(["transaction", "audit"]);
  });

  it("bez invitationId nie zapisuje wpisu", async () => {
    await joinOrganizationCommand({
      userId: "user-new",
      organizationId: "org-a",
      role: "member",
    });

    expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("awaria transakcji członkostwa nie zapisuje wpisu", async () => {
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

  it("awaria zapisu członka bez zaproszenia nie zapisuje wpisu", async () => {
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
