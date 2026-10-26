import { beforeEach, describe, expect, it, vi } from "vitest";
import { WELCOME_SET_PASSWORD_PATH } from "@/shared/lib/auth/reset-password-routing";

const {
  mockPrisma,
  mockGetAdminUserOrNull,
  mockGetOrgContext,
  mockAuthApi,
  mockLogger,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    invitation: { create: vi.fn(), delete: vi.fn() },
  },
  mockGetAdminUserOrNull: vi.fn(),
  mockGetOrgContext: vi.fn(),
  mockAuthApi: { signUpEmail: vi.fn(), requestPasswordReset: vi.fn() },
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
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
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/utils/error-handling", () => ({
  handleCommandError: (_error: unknown, message: string) => ({
    success: false,
    error: message,
  }),
}));

import { inviteUserCommand } from "../invite-user-command";

const validInput = {
  name: "Jan Kowalski",
  email: "jan@firma.pl",
  role: "member" as const,
};

beforeEach(() => {
  mockGetAdminUserOrNull.mockResolvedValue({ id: "admin-1", role: "admin" });
  mockGetOrgContext.mockResolvedValue({ organizationId: "org-1" });
  mockPrisma.invitation.create.mockResolvedValue({ id: "inv-1" });
  mockPrisma.invitation.delete.mockResolvedValue({});
  mockPrisma.user.update.mockResolvedValue({});
  mockAuthApi.signUpEmail.mockResolvedValue({});
  mockAuthApi.requestPasswordReset.mockResolvedValue({});
});

describe("inviteUserCommand", () => {
  it("odrzuca wywołującego bez roli admin", async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: false, error: "Brak uprawnień" });
    expect(mockAuthApi.signUpEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
  });

  it("odrzuca nieprawidłowe dane", async () => {
    const result = await inviteUserCommand({ name: "", email: "x" });

    expect(result.success).toBe(false);
    expect(mockAuthApi.signUpEmail).not.toHaveBeenCalled();
  });

  it("odrzuca rolę spoza listy zapraszanych", async () => {
    const result = await inviteUserCommand({ ...validInput, role: "owner" });

    expect(result.success).toBe(false);
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
  });

  it("odrzuca istniejący adres email", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "existing" });

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Użytkownik z tym adresem już istnieje",
    });
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
  });

  it("tworzy zaproszenie do aktywnej organizacji, konto z zaproszeniem i wysyła mail set-password", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "new-user-1" });

    const result = await inviteUserCommand(validInput);

    expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          email: validInput.email,
          role: "member",
          inviterId: "admin-1",
        }),
      }),
    );
    expect(mockAuthApi.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          email: validInput.email,
          name: validInput.name,
          invitationId: "inv-1",
        }),
      }),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "new-user-1" },
      data: { emailVerified: true },
    });
    expect(mockAuthApi.requestPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          email: validInput.email,
          redirectTo: WELCOME_SET_PASSWORD_PATH,
        },
      }),
    );
    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
  });

  it("usuwa zaproszenie, gdy rejestracja konta się nie powiedzie", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockAuthApi.signUpEmail.mockRejectedValue(new Error("signup failed"));

    const result = await inviteUserCommand(validInput);

    expect(mockPrisma.invitation.delete).toHaveBeenCalledWith({
      where: { id: "inv-1" },
    });
    expect(result.success).toBe(false);
    expect(mockAuthApi.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("sukces mimo błędu wysyłki maila set-password", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "new-user-1" });
    mockAuthApi.requestPasswordReset.mockRejectedValue(new Error("smtp down"));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
