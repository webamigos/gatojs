import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEnv, mockTrackServiceModeEntry } = vi.hoisted(() => ({
  mockPrisma: {
    session: { create: vi.fn() },
    member: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    organization: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  mockEnv: {
    BETTER_AUTH_SECRET: "s".repeat(32),
    APP_URL: "http://localhost:3000",
    AUTH_PUBLIC_SIGNUP: false,
    MULTI_ORG: false,
    ADMIN_IMPERSONATION: false,
  },
  mockTrackServiceModeEntry: vi.fn(),
}));

vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/mailer", () => ({
  sendOrganizationInvitationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("@/features/organizations/services/service-mode-entry", () => ({
  trackServiceModeEntry: mockTrackServiceModeEntry,
}));

import { auth } from "../index";

beforeEach(() => {
  mockTrackServiceModeEntry.mockResolvedValue(undefined);
  mockPrisma.member.findFirst.mockResolvedValue({ organizationId: "org-1" });
  mockPrisma.session.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => data,
  );
});

describe("databaseHooks.session.create", () => {
  it("po zapisaniu sesji przekazuje ją z aktywną organizacją do trackServiceModeEntry", async () => {
    const context = await auth.$context;

    await context.internalAdapter.createSession("user-1");

    expect(mockTrackServiceModeEntry).toHaveBeenCalledTimes(1);
    expect(mockTrackServiceModeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        activeOrganizationId: "org-1",
      }),
    );
  });

  it("hook after woła trackServiceModeEntry z dokładnie tą sesją, którą dostaje", async () => {
    const after = auth.options.databaseHooks?.session?.create?.after;
    const session = {
      id: "session-2",
      userId: "super-1",
      activeOrganizationId: "org-7",
      token: "t",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    await after?.(session);

    expect(mockTrackServiceModeEntry).toHaveBeenCalledTimes(1);
    expect(mockTrackServiceModeEntry).toHaveBeenCalledWith(session);
  });
});
