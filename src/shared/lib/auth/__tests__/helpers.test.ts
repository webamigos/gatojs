import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockRedirect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn((args: unknown) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { args });
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

import { getAdminUserOrNull } from "../helpers";

function mockUser(role: string | null | undefined) {
  mockGetSession.mockResolvedValue({
    user: { id: "u1", email: "u1@example.com", role },
    session: { activeOrganizationId: "org-1" },
  });
}

describe("getAdminUserOrNull", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRedirect.mockClear();
  });

  it("globalny admin → zwraca użytkownika", async () => {
    mockUser("admin");

    await expect(getAdminUserOrNull()).resolves.toMatchObject({
      id: "u1",
      role: "admin",
    });
  });

  it.each([["user"], [null], [undefined], ["Admin"], ["owner"]])(
    "rola %j → null",
    async (role) => {
      mockUser(role);

      await expect(getAdminUserOrNull()).resolves.toBeNull();
    },
  );

  it("brak sesji → przekierowanie na /sign-in", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(getAdminUserOrNull()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/sign-in",
      locale: "pl",
    });
  });
});
