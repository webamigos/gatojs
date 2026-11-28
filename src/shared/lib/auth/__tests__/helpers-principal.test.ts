import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders, mockGetSession, mockRedirect } = vi.hoisted(() => ({
  mockHeaders: vi.fn(async () => new Headers({ cookie: "session=abc" })),
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn((args: unknown) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { args });
  }),
}));

vi.mock("next/headers", () => ({ headers: mockHeaders }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

import { getAdminUserOrNull } from "../helpers";
import {
  runWithRequestPrincipal,
  type RequestPrincipal,
} from "../request-principal";
import type { UserRole } from "../roles";

function principal(accountRole: UserRole): RequestPrincipal {
  return {
    channel: "mcp",
    userId: "u1",
    organizationId: "o1",
    accountRole,
    credentialId: "client-1",
    scopes: ["mcp:read"],
    correlationId: "corr-1",
  };
}

function sessionOf(role: string) {
  mockGetSession.mockResolvedValue({
    user: { id: "u1", email: "u1@example.com", role },
    session: { activeOrganizationId: "o1" },
  });
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockHeaders.mockClear();
  mockRedirect.mockClear();
});

describe("getAdminUserOrNull pod principalem żądania", () => {
  it.each<[UserRole]>([["superadmin"], ["admin"], ["user"]])(
    "zapisana rola konta %s → null bez odczytu sesji",
    async (accountRole) => {
      sessionOf("superadmin");

      await expect(
        runWithRequestPrincipal(principal(accountRole), () =>
          getAdminUserOrNull(),
        ),
      ).resolves.toBeNull();
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockHeaders).not.toHaveBeenCalled();
    },
  );

  it("brak sesji przeglądarki → null bez przekierowania", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(
      runWithRequestPrincipal(principal("superadmin"), () =>
        getAdminUserOrNull(),
      ),
    ).resolves.toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("getAdminUserOrNull bez principala (bez zmian)", () => {
  it("superadmin w sesji → zwraca użytkownika", async () => {
    sessionOf("superadmin");

    await expect(getAdminUserOrNull()).resolves.toMatchObject({
      id: "u1",
      role: "superadmin",
    });
  });

  it("po zakończeniu runWithRequestPrincipal admin w sesji → zwraca użytkownika", async () => {
    sessionOf("admin");
    await runWithRequestPrincipal(principal("admin"), () =>
      getAdminUserOrNull(),
    );

    await expect(getAdminUserOrNull()).resolves.toMatchObject({
      id: "u1",
      role: "admin",
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("brak sesji → przekierowanie na /sign-in", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(getAdminUserOrNull()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/sign-in",
      locale: "pl",
    });
  });
});
