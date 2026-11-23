import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuthApi, mockLogger, mockCurrentLocale } = vi.hoisted(() => ({
  mockCurrentLocale: vi.fn(),
  mockAuthApi: {
    getSession: vi.fn(),
    changePassword: vi.fn(),
  },
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/shared/lib/auth", () => ({ auth: { api: mockAuthApi } }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/i18n/server-locale", () => ({
  currentLocale: () => mockCurrentLocale(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { changePasswordCommand } from "../change-password-command";

const SESSION = { session: { id: "session-1" }, user: { id: "user-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentLocale.mockResolvedValue("pl");
  mockAuthApi.getSession.mockResolvedValue(SESSION);
  mockAuthApi.changePassword.mockResolvedValue({});
});

describe("changePasswordCommand", () => {
  it("returns success when the password change succeeds", async () => {
    const result = await changePasswordCommand("old-pass", "new-pass");

    expect(result).toEqual({ success: true });
    expect(mockAuthApi.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          currentPassword: "old-pass",
          newPassword: "new-pass",
          revokeOtherSessions: false,
        },
      }),
    );
  });

  it("returns an error without calling changePassword when the session expired", async () => {
    mockAuthApi.getSession.mockResolvedValue(null);

    const result = await changePasswordCommand("old-pass", "new-pass");

    expect(result).toEqual({
      success: false,
      error: "Sesja wygasła. Zaloguj się ponownie.",
    });
    expect(mockAuthApi.changePassword).not.toHaveBeenCalled();
  });

  it("returns a generic error when changePassword throws (e.g. wrong current password)", async () => {
    mockAuthApi.changePassword.mockRejectedValue(new Error("Invalid password"));

    const result = await changePasswordCommand("wrong-pass", "new-pass");

    expect(result).toEqual({
      success: false,
      error: "Nie udało się zmienić hasła. Sprawdź aktualne hasło.",
    });
  });

  it("logs an unexpected changePassword failure via logger instead of swallowing it silently", async () => {
    mockAuthApi.changePassword.mockRejectedValue(
      new Error("better-auth: unexpected database error"),
    );

    await changePasswordCommand("old-pass", "new-pass");

    expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), {
      err: expect.objectContaining({
        message: expect.stringContaining("unexpected database error"),
      }),
    });
  });
});

describe("changePasswordCommand: komunikaty w języku żądania", () => {
  it.each([
    ["en", "Your session has expired. Sign in again."],
    ["pl", "Sesja wygasła. Zaloguj się ponownie."],
  ])("%s: wygasła sesja → %j", async (locale, expected) => {
    mockCurrentLocale.mockResolvedValue(locale);
    mockAuthApi.getSession.mockResolvedValue(null);

    const result = await changePasswordCommand("old-pass", "new-pass");

    expect(result).toEqual({ success: false, error: expected });
    expect(mockAuthApi.changePassword).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "Couldn't change the password. Check your current password."],
    ["pl", "Nie udało się zmienić hasła. Sprawdź aktualne hasło."],
  ])("%s: odrzucona zmiana hasła → %j", async (locale, expected) => {
    mockCurrentLocale.mockResolvedValue(locale);
    mockAuthApi.changePassword.mockRejectedValue(new Error("Invalid password"));

    const result = await changePasswordCommand("wrong-pass", "new-pass");

    expect(result).toEqual({ success: false, error: expected });
  });
});
