import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const {
  mockPrisma,
  mockGetAdminUserOrNull,
  mockGetOrgContext,
  mockAuthApi,
  mockLogger,
  mockCreateWelcomeUrl,
  mockSendWelcomeEmail,
  mockTrackAudit,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    invitation: { create: vi.fn(), delete: vi.fn() },
  },
  mockGetAdminUserOrNull: vi.fn(),
  mockGetOrgContext: vi.fn(),
  mockAuthApi: { signUpEmail: vi.fn() },
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  mockCreateWelcomeUrl: vi.fn(),
  mockSendWelcomeEmail: vi.fn(),
  mockTrackAudit: vi.fn(),
}));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/auth/helpers", () => ({
  getAdminUserOrNull: () => mockGetAdminUserOrNull(),
}));
vi.mock("@/shared/lib/auth/org-context", () => ({
  getOrgContext: () => mockGetOrgContext(),
}));
vi.mock("@/shared/lib/auth", () => ({ auth: { api: mockAuthApi } }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/shared/lib/auth/welcome-set-password", () => ({
  createWelcomeSetPasswordUrl: mockCreateWelcomeUrl,
}));
vi.mock("@/shared/lib/mailer", () => ({
  sendWelcomeSetPasswordEmail: mockSendWelcomeEmail,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/lib/audit", async (importActual) => ({
  ...(await importActual<typeof import("@/shared/lib/audit")>()),
  trackAudit: mockTrackAudit,
}));
vi.mock("@/modules.client.generated", async () => {
  const { applyGatoConfig } = await import("@/shared/lib/modules/gato-config");
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    {
      key: "users",
      nav: [],
      routePrefixes: ["/users"],
      adminOnly: true,
      multiOrgRoles: ["owner", "admin"],
    },
  ];
  return {
    authClientPlugins: [],
    clientModules: applyGatoConfig(modules, {
      modules: { users: { enabled: false } },
    }),
  };
});

import { revalidatePath } from "next/cache";
import { inviteUserCommand } from "../invite-user-command";

const validInput = {
  name: "Jan Kowalski",
  email: "jan@firma.pl",
  role: "member" as const,
};

beforeEach(() => {
  mockGetAdminUserOrNull.mockResolvedValue({ id: "admin-1", role: "admin" });
  mockGetOrgContext.mockResolvedValue({
    userId: "admin-1",
    organizationId: "org-1",
    orgRole: "admin",
    userRole: "admin",
    serviceMode: false,
  });
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.invitation.create.mockResolvedValue({ id: "inv-1" });
  mockAuthApi.signUpEmail.mockResolvedValue({ user: { id: "new-user-1" } });
  mockTrackAudit.mockResolvedValue(undefined);
});

describe("inviteUserCommand with users disabled", () => {
  it("returns the generic invitation failure", async () => {
    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Nie udało się zaprosić użytkownika",
    });
  });

  it("stops before the admin check, the session read and any database access", async () => {
    await inviteUserCommand(validInput);

    expect(mockGetAdminUserOrNull).not.toHaveBeenCalled();
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
    expect(mockAuthApi.signUpEmail).not.toHaveBeenCalled();
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it("returns the generic failure, not Brak uprawnień, for a caller without the admin role", async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Nie udało się zaprosić użytkownika",
    });
  });

  it("logs the refusal as a warning, not as an error", async () => {
    await inviteUserCommand(validInput);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
