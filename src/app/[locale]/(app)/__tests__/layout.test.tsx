import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOrgContext, mockRedirect } = vi.hoisted(() => ({
  mockGetOrgContext: vi.fn(),
  mockRedirect: vi.fn((args: unknown) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { args });
  }),
}));

vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/shared/lib/auth/org-context", async () => {
  class NoOrganizationError extends Error {}
  return { NoOrganizationError, getOrgContext: mockGetOrgContext };
});

import { NoOrganizationError } from "@/shared/lib/auth/org-context";
import AppLayout from "../layout";

const params = Promise.resolve({ locale: "en" });

describe("(app) layout", () => {
  beforeEach(() => {
    mockGetOrgContext.mockReset();
  });

  it("użytkownik bez członkostwa → przekierowanie na /no-organization, nie 500", async () => {
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());

    await expect(AppLayout({ children: "treść", params })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/no-organization",
      locale: "en",
    });
  });

  it("inne błędy nie są połykane", async () => {
    mockGetOrgContext.mockRejectedValue(new Error("db down"));

    await expect(AppLayout({ children: "treść", params })).rejects.toThrow(
      "db down",
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("członek organizacji widzi zawartość", async () => {
    mockGetOrgContext.mockResolvedValue({
      userId: "u1",
      organizationId: "org-1",
      orgRole: "member",
      userRole: "user",
    });

    await expect(AppLayout({ children: "treść", params })).resolves.toEqual(
      "treść",
    );
  });
});
