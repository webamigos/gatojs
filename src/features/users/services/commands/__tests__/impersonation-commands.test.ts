import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockGetImpersonatedByUserId, mockLogger } =
  vi.hoisted(() => ({
    mockGetCurrentUser: vi.fn(),
    mockGetImpersonatedByUserId: vi.fn(),
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));

vi.mock("@/shared/lib/auth/helpers", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getImpersonatedByUserId: () => mockGetImpersonatedByUserId(),
}));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

import {
  logImpersonationStartCommand,
  logImpersonationStopCommand,
} from "../impersonation-commands";

describe.each([
  ["start", logImpersonationStartCommand, "started"],
  ["stop", logImpersonationStopCommand, "stopped"],
] as const)("impersonation %s", (_name, command, event) => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-2" });
  });

  it("nic nie zapisuje, gdy sesja nie jest impersonowana", async () => {
    mockGetImpersonatedByUserId.mockResolvedValue(null);

    const result = await command();

    expect(result).toEqual({ success: true });
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it("zapisuje admina i użytkownika docelowego", async () => {
    mockGetImpersonatedByUserId.mockResolvedValue("admin-1");

    const result = await command();

    expect(result).toEqual({ success: true });
    expect(mockLogger.info).toHaveBeenCalledWith(
      `[USERS] Impersonation ${event}`,
      { impersonatorUserId: "admin-1", targetUserId: "user-2" },
    );
  });

  it("zapisuje null jako cel, gdy nie ma bieżącego użytkownika", async () => {
    mockGetImpersonatedByUserId.mockResolvedValue("admin-1");
    mockGetCurrentUser.mockResolvedValue(null);

    await command();

    expect(mockLogger.info).toHaveBeenCalledWith(
      `[USERS] Impersonation ${event}`,
      { impersonatorUserId: "admin-1", targetUserId: null },
    );
  });

  it("zwraca porażkę, gdy odczyt sesji rzuca błąd", async () => {
    mockGetImpersonatedByUserId.mockRejectedValue(new Error("session"));

    const result = await command();

    expect(result.success).toBe(false);
  });
});
