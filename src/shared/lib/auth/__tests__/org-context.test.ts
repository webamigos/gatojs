import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindFirst, mockRedirect } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockMemberFindFirst: vi.fn(),
    mockRedirect: vi.fn((args: unknown) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { args });
    }),
  }),
);

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "en") }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: { member: { findFirst: mockMemberFindFirst } },
}));

import { getOrgContext, NoOrganizationError } from "../org-context";

function mockSession(input: {
  userId: string;
  activeOrganizationId: string | null;
  role?: string;
}) {
  mockGetSession.mockResolvedValue({
    user: { id: input.userId, role: input.role ?? "user" },
    session: { activeOrganizationId: input.activeOrganizationId },
  });
}

describe("getOrgContext", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockMemberFindFirst.mockReset();
  });

  it("użytkownik bez członkostwa → NoOrganizationError", async () => {
    mockSession({ userId: "u1", activeOrganizationId: null });
    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
    expect(mockMemberFindFirst).not.toHaveBeenCalled();
  });

  it("brak aktywnej organizacji w cache → ponowny odczyt sesji z bazy", async () => {
    mockGetSession
      .mockResolvedValueOnce({
        user: { id: "u1", role: "user" },
        session: { activeOrganizationId: null },
      })
      .mockResolvedValueOnce({
        user: { id: "u1", role: "user" },
        session: { activeOrganizationId: "org-1" },
      });
    mockMemberFindFirst.mockResolvedValue({ role: "member" });

    await expect(getOrgContext()).resolves.toMatchObject({
      organizationId: "org-1",
      orgRole: "member",
    });
    expect(mockGetSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("aktywna organizacja bez członkostwa → NoOrganizationError", async () => {
    mockSession({ userId: "u1", activeOrganizationId: "org-1" });
    mockMemberFindFirst.mockResolvedValue(null);

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
    expect(mockMemberFindFirst).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: "u1" },
      select: { role: true },
    });
  });

  it("brak sesji → przekierowanie na /sign-in z bieżącym locale", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/sign-in",
      locale: "en",
    });
  });

  it("zwraca kontekst członka aktywnej organizacji", async () => {
    mockSession({ userId: "u1", activeOrganizationId: "org-1", role: "admin" });
    mockMemberFindFirst.mockResolvedValue({ role: "owner" });

    await expect(getOrgContext()).resolves.toEqual({
      userId: "u1",
      organizationId: "org-1",
      orgRole: "owner",
      userRole: "admin",
    });
  });

  it("nieznane role zawężone do member/user", async () => {
    mockSession({
      userId: "u1",
      activeOrganizationId: "org-1",
      role: "superuser",
    });
    mockMemberFindFirst.mockResolvedValue({ role: "customer_experience" });

    await expect(getOrgContext()).resolves.toMatchObject({
      orgRole: "member",
      userRole: "user",
    });
  });
});
