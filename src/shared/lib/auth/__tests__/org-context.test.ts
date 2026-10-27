import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSession,
  mockMemberFindFirst,
  mockRedirect,
  existingOrganizationIds,
  mockOrganization,
} = vi.hoisted(() => {
  const existingOrganizationIds = new Set<string>();
  const lookup = async (args: { where?: { id?: unknown } }) => {
    const id = args?.where?.id;
    return typeof id === "string" && existingOrganizationIds.has(id)
      ? { id, name: `Organizacja ${id}` }
      : null;
  };
  return {
    mockGetSession: vi.fn(),
    mockMemberFindFirst: vi.fn(),
    mockRedirect: vi.fn((args: unknown) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { args });
    }),
    existingOrganizationIds,
    mockOrganization: {
      findUnique: vi.fn(lookup),
      findFirst: vi.fn(lookup),
      count: vi.fn(async (args: { where?: { id?: unknown } }) =>
        (await lookup(args)) ? 1 : 0,
      ),
    },
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "en") }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    member: { findFirst: mockMemberFindFirst },
    organization: mockOrganization,
  },
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
    existingOrganizationIds.clear();
    existingOrganizationIds.add("org-1");
    existingOrganizationIds.add("org-2");
  });

  it("użytkownik bez członkostwa → NoOrganizationError", async () => {
    mockSession({ userId: "u1", activeOrganizationId: null });
    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
    expect(mockMemberFindFirst).not.toHaveBeenCalled();
  });

  it("brak aktywnej organizacji w cache → organizacja z bazy po jednym odczycie bez cookie cache", async () => {
    mockSessionWithCookieCache({
      userId: "u1",
      role: "user",
      cachedOrganizationId: null,
      storedOrganizationId: "org-1",
    });
    mockMemberFindFirst.mockResolvedValue({ role: "member" });

    await expect(getOrgContext()).resolves.toMatchObject({
      organizationId: "org-1",
      orgRole: "member",
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("aktywna organizacja w cache → jeden odczyt sesji, zawsze z pominięciem cookie cache", async () => {
    mockSession({ userId: "u1", activeOrganizationId: "org-1" });
    mockMemberFindFirst.mockResolvedValue({ role: "member" });

    await getOrgContext();

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("członek po przełączeniu organizacji → kontekst z bazy, nie z cookie cache", async () => {
    mockSessionWithCookieCache({
      userId: "u1",
      role: "user",
      cachedOrganizationId: "org-1",
      storedOrganizationId: "org-2",
    });
    mockMemberFindFirst.mockResolvedValue({ role: "member" });

    await expect(getOrgContext()).resolves.toEqual({
      userId: "u1",
      organizationId: "org-2",
      orgRole: "member",
      userRole: "user",
      serviceMode: false,
    });
    expect(mockMemberFindFirst).toHaveBeenCalledWith({
      where: { organizationId: "org-2", userId: "u1" },
      select: { role: true },
    });
  });

  it("brak sesji → bez ponownego odczytu z pominięciem cache", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetSession).toHaveBeenCalledTimes(1);
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
      serviceMode: false,
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

function mockSessionWithCookieCache(input: {
  userId: string;
  role: string;
  cachedOrganizationId: string | null;
  storedOrganizationId: string | null;
}) {
  mockGetSession.mockImplementation(
    async (args: { query?: { disableCookieCache?: boolean } }) => ({
      user: { id: input.userId, role: input.role },
      session: {
        id: "s-1",
        activeOrganizationId: args.query?.disableCookieCache
          ? input.storedOrganizationId
          : input.cachedOrganizationId,
      },
    }),
  );
}

describe("getOrgContext superadmina", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockMemberFindFirst.mockReset();
    existingOrganizationIds.clear();
    existingOrganizationIds.add("org-1");
    existingOrganizationIds.add("org-2");
  });

  it("superadmin bez członkostwa w istniejącej aktywnej organizacji → owner w trybie serwisowym", async () => {
    mockSession({
      userId: "sa-1",
      activeOrganizationId: "org-2",
      role: "superadmin",
    });
    mockMemberFindFirst.mockResolvedValue(null);

    await expect(getOrgContext()).resolves.toEqual({
      userId: "sa-1",
      organizationId: "org-2",
      orgRole: "owner",
      userRole: "superadmin",
      serviceMode: true,
    });
  });

  it("superadmin z członkostwem → rola z członkostwa, bez trybu serwisowego", async () => {
    mockSession({
      userId: "sa-1",
      activeOrganizationId: "org-1",
      role: "superadmin",
    });
    mockMemberFindFirst.mockResolvedValue({ role: "member" });

    await expect(getOrgContext()).resolves.toEqual({
      userId: "sa-1",
      organizationId: "org-1",
      orgRole: "member",
      userRole: "superadmin",
      serviceMode: false,
    });
  });

  it("zwykły członek nigdy nie jest w trybie serwisowym", async () => {
    mockSession({ userId: "u1", activeOrganizationId: "org-1" });
    mockMemberFindFirst.mockResolvedValue({ role: "owner" });

    await expect(getOrgContext()).resolves.toMatchObject({
      orgRole: "owner",
      serviceMode: false,
    });
  });

  it("superadmin z aktywną organizacją, która nie istnieje → NoOrganizationError", async () => {
    mockSession({
      userId: "sa-1",
      activeOrganizationId: "org-deleted",
      role: "superadmin",
    });
    mockMemberFindFirst.mockResolvedValue(null);

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
  });

  it("superadmin bez aktywnej organizacji → NoOrganizationError, nigdy kontekst bez organizacji", async () => {
    mockSession({
      userId: "sa-1",
      activeOrganizationId: null,
      role: "superadmin",
    });
    mockMemberFindFirst.mockResolvedValue({ role: "owner" });

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
  });

  it("superadmin z pustym identyfikatorem aktywnej organizacji → NoOrganizationError", async () => {
    existingOrganizationIds.add("");
    mockSession({
      userId: "sa-1",
      activeOrganizationId: "",
      role: "superadmin",
    });
    mockMemberFindFirst.mockResolvedValue(null);

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
  });

  it("globalny admin bez członkostwa w aktywnej organizacji → NoOrganizationError, bez trybu serwisowego", async () => {
    mockSession({
      userId: "a-1",
      activeOrganizationId: "org-2",
      role: "admin",
    });
    mockMemberFindFirst.mockResolvedValue(null);

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
  });

  it("superadmin czyta sesję z pominięciem cookie cache → od razu widzi nową organizację", async () => {
    mockSessionWithCookieCache({
      userId: "sa-1",
      role: "superadmin",
      cachedOrganizationId: "org-1",
      storedOrganizationId: "org-2",
    });
    mockMemberFindFirst.mockResolvedValue(null);

    await expect(getOrgContext()).resolves.toEqual({
      userId: "sa-1",
      organizationId: "org-2",
      orgRole: "owner",
      userRole: "superadmin",
      serviceMode: true,
    });
    expect(mockGetSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("superadmin: organizacja z cache została opuszczona w bazie → NoOrganizationError", async () => {
    mockSessionWithCookieCache({
      userId: "sa-1",
      role: "superadmin",
      cachedOrganizationId: "org-1",
      storedOrganizationId: null,
    });
    mockMemberFindFirst.mockResolvedValue({ role: "owner" });

    await expect(getOrgContext()).rejects.toBeInstanceOf(NoOrganizationError);
  });

  it("członkostwo sprawdzane w organizacji z bazy, nie z cache", async () => {
    mockSessionWithCookieCache({
      userId: "sa-1",
      role: "superadmin",
      cachedOrganizationId: "org-1",
      storedOrganizationId: "org-2",
    });
    mockMemberFindFirst.mockImplementation(
      async (args: { where: { organizationId: string } }) =>
        args.where.organizationId === "org-1" ? { role: "member" } : null,
    );

    await expect(getOrgContext()).resolves.toMatchObject({
      organizationId: "org-2",
      orgRole: "owner",
      serviceMode: true,
    });
  });
});
