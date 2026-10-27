import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockGetAdminUserOrNull,
  mockGetOrgContext,
  mockAuthApi,
  mockLogger,
  mockCreateWelcomeUrl,
  mockSendWelcomeEmail,
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
vi.mock("@/shared/utils/error-handling", () => ({
  handleCommandError: (_error: unknown, message: string) => ({
    success: false,
    error: message,
  }),
}));

import { revalidatePath } from "next/cache";
import { inviteUserCommand } from "../invite-user-command";

const WELCOME_URL =
  "http://localhost:3000/api/auth/reset-password/tok?callbackURL=%2Fset-password";

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
  mockAuthApi.signUpEmail.mockResolvedValue({ user: { id: "new-user-1" } });
  mockCreateWelcomeUrl.mockResolvedValue(WELCOME_URL);
  mockSendWelcomeEmail.mockResolvedValue({ data: { id: "mail-1" } });
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

  it("zaproszenie wygasa dokładnie 48 godzin po utworzeniu", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-10T08:00:00.000Z"),
    });
    try {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await inviteUserCommand(validInput);

      const { expiresAt } = mockPrisma.invitation.create.mock.calls[0][0].data;
      expect(expiresAt).toEqual(new Date("2026-03-12T08:00:00.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("tworzy zaproszenie do aktywnej organizacji, konto z zaproszeniem i wysyła mail set-password", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

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
    expect(mockCreateWelcomeUrl).toHaveBeenCalledWith("new-user-1");
    expect(mockSendWelcomeEmail).toHaveBeenCalledWith({
      to: validInput.email,
      name: validInput.name,
      resetUrl: WELCOME_URL,
    });
    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
  });

  it("email z wielkimi literami: konto, zaproszenie i mail set-password na znormalizowanym adresie", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const result = await inviteUserCommand({
      ...validInput,
      email: "  Jan@Firma.PL ",
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "jan@firma.pl" } }),
    );
    expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "jan@firma.pl" }),
      }),
    );
    expect(mockAuthApi.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          email: "jan@firma.pl",
          invitationId: "inv-1",
        }),
      }),
    );
    expect(mockPrisma.invitation.delete).not.toHaveBeenCalled();
    expect(mockSendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jan@firma.pl" }),
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
    expect(mockCreateWelcomeUrl).not.toHaveBeenCalled();
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("mailer zwraca { error } → sukces z ostrzeżeniem mail-failed", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockSendWelcomeEmail.mockResolvedValue({
      error: "Nie udało się wysłać emaila powitalnego",
    });

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({
      success: true,
      data: { userId: "new-user-1" },
      warning: "mail-failed",
    });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("błąd tworzenia tokenu → sukces z ostrzeżeniem mail-failed", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockCreateWelcomeUrl.mockRejectedValue(new Error("db down"));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({
      success: true,
      data: { userId: "new-user-1" },
      warning: "mail-failed",
    });
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("mailer bez skonfigurowanego transportu ({ data: null }) → brak ostrzeżenia", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockSendWelcomeEmail.mockResolvedValue({ data: null });

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
  });

  it("udane zaproszenie odświeża listę użytkowników", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const result = await inviteUserCommand(validInput);

    expect(result.success).toBe(true);
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/users");
  });

  it("zaproszenie bez uprawnień nie odświeża listy użytkowników", async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);

    await inviteUserCommand(validInput);

    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it("zaproszenie z błędem walidacji nie odświeża listy użytkowników", async () => {
    await inviteUserCommand({ name: "", email: "x" });

    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });
});
