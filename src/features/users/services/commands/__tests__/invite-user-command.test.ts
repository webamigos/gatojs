import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { revalidatePath } from "next/cache";
import { inviteUserCommand } from "../invite-user-command";

const WELCOME_URL =
  "http://localhost:3000/api/auth/reset-password/tok?callbackURL=%2Fset-password";

const MEMBER_CONTEXT = {
  userId: "admin-1",
  organizationId: "org-1",
  orgRole: "admin",
  userRole: "admin",
  serviceMode: false,
};

const SERVICE_CONTEXT = {
  userId: "super-1",
  organizationId: "org-1",
  orgRole: "owner",
  userRole: "superadmin",
  serviceMode: true,
};

const SERVICE_MODE_ERROR = {
  success: false,
  error: "Potwierdź zmianę w trybie serwisowym",
};

const validInput = {
  name: "Jan Kowalski",
  email: "jan@firma.pl",
  role: "member" as const,
};

beforeEach(() => {
  mockGetAdminUserOrNull.mockResolvedValue({ id: "admin-1", role: "admin" });
  mockGetOrgContext.mockResolvedValue(MEMBER_CONTEXT);
  mockPrisma.invitation.create.mockResolvedValue({ id: "inv-1" });
  mockPrisma.invitation.delete.mockResolvedValue({});
  mockPrisma.user.update.mockResolvedValue({});
  mockAuthApi.signUpEmail.mockResolvedValue({ user: { id: "new-user-1" } });
  mockCreateWelcomeUrl.mockResolvedValue(WELCOME_URL);
  mockSendWelcomeEmail.mockResolvedValue({ data: { id: "mail-1" } });
  mockTrackAudit.mockResolvedValue(undefined);
});

function expectNoDatabaseAccess() {
  expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
  expect(mockPrisma.invitation.delete).not.toHaveBeenCalled();
  expect(mockAuthApi.signUpEmail).not.toHaveBeenCalled();
  expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
  expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
}

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

  describe("tryb serwisowy", () => {
    beforeEach(() => {
      mockGetAdminUserOrNull.mockResolvedValue({
        id: "super-1",
        role: "superadmin",
      });
      mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });

    it("bez potwierdzenia → błąd trybu serwisowego i brak dostępu do bazy", async () => {
      const result = await inviteUserCommand(validInput);

      expect(result).toEqual(SERVICE_MODE_ERROR);
      expectNoDatabaseAccess();
    });

    it("potwierdzenie innej organizacji → błąd trybu serwisowego i brak dostępu do bazy", async () => {
      const result = await inviteUserCommand(validInput, {
        serviceModeConfirmed: true,
        organizationId: "org-2",
      });

      expect(result).toEqual(SERVICE_MODE_ERROR);
      expectNoDatabaseAccess();
    });

    it("serviceModeConfirmed: false → błąd trybu serwisowego i brak dostępu do bazy", async () => {
      const result = await inviteUserCommand(validInput, {
        serviceModeConfirmed: false,
        organizationId: "org-1",
      });

      expect(result).toEqual(SERVICE_MODE_ERROR);
      expectNoDatabaseAccess();
    });

    it("potwierdzenie w postaci napisu → błąd trybu serwisowego", async () => {
      const result = await inviteUserCommand(validInput, "yes");

      expect(result).toEqual(SERVICE_MODE_ERROR);
      expectNoDatabaseAccess();
    });

    it("potwierdzenie aktywnej organizacji → zaproszenie utworzone w tej organizacji", async () => {
      const result = await inviteUserCommand(validInput, {
        serviceModeConfirmed: true,
        organizationId: "org-1",
      });

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            email: validInput.email,
            inviterId: "super-1",
          }),
        }),
      );
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/users");
    });
  });

  describe("poza trybem serwisowym", () => {
    beforeEach(() => {
      mockGetOrgContext.mockResolvedValue({
        ...MEMBER_CONTEXT,
        orgRole: "owner",
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });

    it("owner organizacji A z potwierdzeniem dla organizacji B → błąd trybu serwisowego i brak dostępu do bazy", async () => {
      const result = await inviteUserCommand(validInput, {
        serviceModeConfirmed: true,
        organizationId: "org-2",
      });

      expect(result).toEqual(SERVICE_MODE_ERROR);
      expectNoDatabaseAccess();
    });

    it("potwierdzenie aktywnej organizacji → zaproszenie utworzone w tej organizacji", async () => {
      const result = await inviteUserCommand(validInput, {
        serviceModeConfirmed: true,
        organizationId: "org-1",
      });

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: "org-1" }),
        }),
      );
    });

    it("bez potwierdzenia → zaproszenie utworzone jak dotąd", async () => {
      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: "org-1" }),
        }),
      );
    });
  });

  describe("wpis member.invited w dzienniku zdarzeń", () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });

    it("udane zaproszenie zapisuje jeden wpis member.invited z aktorem, organizacją i id zaproszenia", async () => {
      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(mockTrackAudit).toHaveBeenCalledTimes(1);
      expect(mockTrackAudit).toHaveBeenCalledWith({
        organizationId: "org-1",
        actorUserId: "admin-1",
        serviceMode: false,
        action: "member.invited",
        entityType: "invitation",
        entityId: "inv-1",
        newData: { email: "jan@firma.pl", role: "member" },
      });
    });

    it("wpis zawiera email i rolę po walidacji schematu, nie surowe wejście", async () => {
      await inviteUserCommand({
        ...validInput,
        email: "  JAN@Firma.PL ",
        role: "admin",
      });

      expect(mockTrackAudit).toHaveBeenCalledTimes(1);
      expect(mockTrackAudit.mock.calls[0][0].newData).toEqual({
        email: "jan@firma.pl",
        role: "admin",
      });
    });

    it("wpis powstaje dopiero po udanej rejestracji konta", async () => {
      await inviteUserCommand(validInput);

      expect(mockTrackAudit).toHaveBeenCalledTimes(1);
      expect(mockTrackAudit.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockAuthApi.signUpEmail.mock.invocationCallOrder[0],
      );
    });

    it("nieudana rejestracja: zaproszenie wycofane, błąd i brak wpisu", async () => {
      mockAuthApi.signUpEmail.mockRejectedValue(new Error("signup failed"));

      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({
        success: false,
        error: "Nie udało się zaprosić użytkownika",
      });
      expect(mockPrisma.invitation.delete).toHaveBeenCalledWith({
        where: { id: "inv-1" },
      });
      expect(mockTrackAudit).not.toHaveBeenCalled();
    });

    it("istniejący adres: błąd i brak wpisu", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" });

      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({
        success: false,
        error: "Użytkownik z tym adresem już istnieje",
      });
      expect(mockTrackAudit).not.toHaveBeenCalled();
    });

    it("wywołujący bez roli admin: brak wpisu", async () => {
      mockGetAdminUserOrNull.mockResolvedValue(null);

      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({ success: false, error: "Brak uprawnień" });
      expect(mockTrackAudit).not.toHaveBeenCalled();
    });

    it("błędne wejście: brak wpisu", async () => {
      const result = await inviteUserCommand({ name: "", email: "x" });

      expect(result.success).toBe(false);
      expect(mockTrackAudit).not.toHaveBeenCalled();
    });

    it("niewysłany mail powitalny: sukces z ostrzeżeniem i wpis member.invited jest", async () => {
      mockSendWelcomeEmail.mockRejectedValue(new Error("smtp down"));

      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({
        success: true,
        data: { userId: "new-user-1" },
        warning: "mail-failed",
      });
      expect(mockTrackAudit).toHaveBeenCalledTimes(1);
      expect(mockTrackAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "member.invited",
          entityId: "inv-1",
        }),
      );
    });

    describe("w trybie serwisowym", () => {
      beforeEach(() => {
        mockGetAdminUserOrNull.mockResolvedValue({
          id: "super-1",
          role: "superadmin",
        });
        mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);
      });

      it("z potwierdzeniem: wpis z aktorem superadmina i serviceMode: true", async () => {
        const result = await inviteUserCommand(validInput, {
          serviceModeConfirmed: true,
          organizationId: "org-1",
        });

        expect(result).toEqual({
          success: true,
          data: { userId: "new-user-1" },
        });
        expect(mockTrackAudit).toHaveBeenCalledTimes(1);
        expect(mockTrackAudit).toHaveBeenCalledWith({
          organizationId: "org-1",
          actorUserId: "super-1",
          serviceMode: true,
          action: "member.invited",
          entityType: "invitation",
          entityId: "inv-1",
          newData: { email: "jan@firma.pl", role: "member" },
        });
      });

      it("bez potwierdzenia: błąd trybu serwisowego, brak zaproszenia i wpisu", async () => {
        const result = await inviteUserCommand(validInput);

        expect(result).toEqual(SERVICE_MODE_ERROR);
        expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
        expect(mockTrackAudit).not.toHaveBeenCalled();
      });
    });
  });
});
