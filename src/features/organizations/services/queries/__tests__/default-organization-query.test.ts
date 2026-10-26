import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }));

vi.mock("@/shared/lib/prisma", () => ({
  prisma: { member: { findFirst: mockFindFirst } },
}));
vi.mock("@/shared/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { getDefaultActiveOrganizationId } from "../default-organization-query";

describe("getDefaultActiveOrganizationId", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("zwraca pierwsze członkostwo użytkownika", async () => {
    mockFindFirst.mockResolvedValue({ organizationId: "org-1" });

    await expect(getDefaultActiveOrganizationId("u1")).resolves.toBe("org-1");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("brak członkostwa → null", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getDefaultActiveOrganizationId("u1")).resolves.toBeNull();
  });

  it("błąd bazy nie blokuje logowania → null", async () => {
    mockFindFirst.mockRejectedValue(new Error("db down"));
    await expect(getDefaultActiveOrganizationId("u1")).resolves.toBeNull();
  });
});
