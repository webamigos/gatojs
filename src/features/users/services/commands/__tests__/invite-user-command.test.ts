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

const { emitted, timeline, failingSubscriber, scopeInSubscriber } = vi.hoisted(
  () => ({
    emitted: [] as unknown[],
    timeline: [] as string[],
    failingSubscriber: { enabled: false },
    scopeInSubscriber: [] as boolean[],
  }),
);

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
vi.mock("@/modules.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.generated")>()),
  moduleEvents: [],
  moduleSubscribers: [
    {
      module: "probe",
      value: {
        "users.invited": [
          {
            id: "probe.a-fail",
            run: () => {
              if (failingSubscriber.enabled) {
                throw new Error("subscriber down");
              }
            },
          },
          {
            id: "probe.record",
            run: (event: unknown) => {
              timeline.push("event");
              emitted.push(event);
            },
          },
          {
            id: "probe.scope",
            run: () => {
              scopeInSubscriber.push(isInviteSignup());
            },
          },
        ],
      },
    },
  ],
}));

import { revalidatePath } from "next/cache";
import { isInviteSignup } from "@/shared/lib/auth/invite-signup-scope";
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
  emitted.length = 0;
  timeline.length = 0;
  failingSubscriber.enabled = false;
  scopeInSubscriber.length = 0;
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
      error: "Failed to send welcome email",
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

  describe("users.invited domain event", () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });

    it("a successful invitation emits exactly one users.invited with the context organization, actor and the invitation", async () => {
      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(emitted).toEqual([
        {
          name: "users.invited",
          organizationId: "org-1",
          actorUserId: "admin-1",
          payload: {
            invitationId: "inv-1",
            email: "jan@firma.pl",
            role: "member",
          },
        },
      ]);
    });

    it("the organization and actor come from the context, the email and role from the parsed input", async () => {
      mockGetAdminUserOrNull.mockResolvedValue({
        id: "super-1",
        role: "superadmin",
      });
      mockGetOrgContext.mockResolvedValue({
        ...SERVICE_CONTEXT,
        organizationId: "org-9",
      });
      mockPrisma.invitation.create.mockResolvedValue({ id: "inv-9" });

      await inviteUserCommand(
        { ...validInput, email: "  Ewa@Firma.PL ", role: "admin" },
        { serviceModeConfirmed: true, organizationId: "org-9" },
      );

      expect(emitted).toEqual([
        {
          name: "users.invited",
          organizationId: "org-9",
          actorUserId: "super-1",
          payload: {
            invitationId: "inv-9",
            email: "ewa@firma.pl",
            role: "admin",
          },
        },
      ]);
    });

    it("the event comes after trackAudit has finished its write", async () => {
      mockTrackAudit.mockImplementation(async () => {
        timeline.push("audit:start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        timeline.push("audit:end");
      });

      await inviteUserCommand(validInput);

      expect(timeline).toEqual(["audit:start", "audit:end", "event"]);
    });

    it("an existing email emits no event", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" });

      await inviteUserCommand(validInput);

      expect(emitted).toEqual([]);
    });

    it("a failed account registration emits no event", async () => {
      mockAuthApi.signUpEmail.mockRejectedValue(new Error("signup failed"));

      await inviteUserCommand(validInput);

      expect(emitted).toEqual([]);
    });

    it("a caller without the admin role emits no event", async () => {
      mockGetAdminUserOrNull.mockResolvedValue(null);

      await inviteUserCommand(validInput);

      expect(emitted).toEqual([]);
    });

    it("service mode without confirmation emits no event", async () => {
      mockGetAdminUserOrNull.mockResolvedValue({
        id: "super-1",
        role: "superadmin",
      });
      mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

      await inviteUserCommand(validInput);

      expect(emitted).toEqual([]);
    });

    it("a throwing subscriber does not fail the invitation", async () => {
      failingSubscriber.enabled = true;

      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(emitted).toHaveLength(1);
      expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("account registration inside the admin invite scope", () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });

    it("isInviteSignup() is true while auth.api.signUpEmail runs, also after an await inside it", async () => {
      const seen: boolean[] = [];
      mockAuthApi.signUpEmail.mockImplementation(async () => {
        seen.push(isInviteSignup());
        await new Promise((resolve) => setTimeout(resolve, 1));
        seen.push(isInviteSignup());
        return { user: { id: "new-user-1" } };
      });

      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(seen).toEqual([true, true]);
    });

    it("isInviteSignup() is false after a successful invitation", async () => {
      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
      expect(isInviteSignup()).toBe(false);
    });

    it("isInviteSignup() is false after a failed account registration", async () => {
      const seen: boolean[] = [];
      mockAuthApi.signUpEmail.mockImplementation(async () => {
        seen.push(isInviteSignup());
        throw new Error("signup failed");
      });

      const result = await inviteUserCommand(validInput);

      expect(result).toEqual({
        success: false,
        error: "Nie udało się zaprosić użytkownika",
      });
      expect(seen).toEqual([true]);
      expect(isInviteSignup()).toBe(false);
    });

    it("the users.invited subscribers run outside the invite scope", async () => {
      await inviteUserCommand(validInput);

      expect(emitted).toHaveLength(1);
      expect(scopeInSubscriber).toEqual([false]);
    });

    it("the existing-email check, the invitation write and the welcome mail run outside the invite scope", async () => {
      const seen: Record<string, boolean> = {};
      mockPrisma.user.findUnique.mockImplementation(async () => {
        seen.findUnique = isInviteSignup();
        return null;
      });
      mockPrisma.invitation.create.mockImplementation(async () => {
        seen.invitationCreate = isInviteSignup();
        return { id: "inv-1" };
      });
      mockSendWelcomeEmail.mockImplementation(async () => {
        seen.welcomeMail = isInviteSignup();
        return { data: { id: "mail-1" } };
      });

      await inviteUserCommand(validInput);

      expect(seen).toEqual({
        findUnique: false,
        invitationCreate: false,
        welcomeMail: false,
      });
    });
  });
});
