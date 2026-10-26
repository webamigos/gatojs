import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockGetAdminUserOrNull, mockNotFound } = vi.hoisted(
  () => ({
    mockFindMany: vi.fn(),
    mockGetAdminUserOrNull: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("@/shared/lib/prisma", () => ({
  prisma: { user: { findMany: (args: unknown) => mockFindMany(args) } },
}));
vi.mock("@/shared/lib/auth/helpers", () => ({
  getAdminUserOrNull: () => mockGetAdminUserOrNull(),
}));
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

import { getUserAccountsQuery } from "../user-account-queries";

const ROW = {
  id: "u1",
  name: "Jan Kowalski",
  email: "jan@firma.pl",
  role: "admin",
  emailVerified: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("getUserAccountsQuery", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it("zwraca użytkowników od najnowszych dla admina", async () => {
    mockGetAdminUserOrNull.mockResolvedValue({ id: "admin-1" });
    mockFindMany.mockResolvedValue([ROW]);

    const result = await getUserAccountsQuery();

    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    expect(result).toEqual([ROW]);
  });

  it("nieznana rola z bazy jest zawężana do user", async () => {
    mockGetAdminUserOrNull.mockResolvedValue({ id: "admin-1" });
    mockFindMany.mockResolvedValue([{ ...ROW, role: "weird" }]);

    const result = await getUserAccountsQuery();

    expect(result[0]?.role).toBe("user");
  });

  it("non-admin → notFound i brak zapytania do bazy", async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);

    await expect(getUserAccountsQuery()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
