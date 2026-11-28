import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockHeaders,
  mockGetSession,
  mockMemberFindFirst,
  mockRedirect,
  mockOrganization,
} = vi.hoisted(() => {
  const lookup = async (args: { where?: { id?: unknown } }) =>
    args?.where?.id === "o1" ? { id: "o1", name: "Organizacja o1" } : null;
  return {
    mockHeaders: vi.fn(async () => new Headers({ cookie: "session=abc" })),
    mockGetSession: vi.fn(),
    mockMemberFindFirst: vi.fn(),
    mockRedirect: vi.fn((args: unknown) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { args });
    }),
    mockOrganization: {
      findUnique: vi.fn(lookup),
      findFirst: vi.fn(lookup),
      count: vi.fn(async (args: { where?: { id?: unknown } }) =>
        (await lookup(args)) ? 1 : 0,
      ),
    },
  };
});

vi.mock("next/headers", () => ({ headers: mockHeaders }));
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

import auditLogsModule from "@/features/audit-logs/module";
import { getOrgContext, NoOrganizationError } from "../org-context";
import { can, canAccessModule } from "../permissions";
import {
  runWithRequestPrincipal,
  type RequestPrincipal,
} from "../request-principal";
import type { UserRole } from "../roles";

function principal(accountRole: UserRole = "user"): RequestPrincipal {
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

function memberRole(role: string | null) {
  mockMemberFindFirst.mockResolvedValue(role === null ? null : { role });
}

function sessionOf(input: {
  userId: string;
  role: string;
  activeOrganizationId: string | null;
}) {
  mockGetSession.mockResolvedValue({
    user: { id: input.userId, role: input.role },
    session: { id: "s-1", activeOrganizationId: input.activeOrganizationId },
  });
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockMemberFindFirst.mockReset();
  mockHeaders.mockClear();
  mockRedirect.mockClear();
  mockOrganization.findUnique.mockClear();
  mockOrganization.findFirst.mockClear();
  mockOrganization.count.mockClear();
});

describe("getOrgContext pod principalem żądania", () => {
  it("członek z rolą admin → dokładnie kontekst z principala i roli z bazy, bez odczytu sesji", async () => {
    memberRole("admin");

    const context = await runWithRequestPrincipal(principal(), () =>
      getOrgContext(),
    );

    expect(context).toStrictEqual({
      userId: "u1",
      organizationId: "o1",
      orgRole: "admin",
      userRole: "user",
      serviceMode: false,
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("członkostwo czytane z organizationId i userId principala", async () => {
    memberRole("member");

    await runWithRequestPrincipal(principal(), () => getOrgContext());

    expect(mockMemberFindFirst).toHaveBeenCalledTimes(1);
    expect(mockMemberFindFirst).toHaveBeenCalledWith({
      where: { organizationId: "o1", userId: "u1" },
      select: { role: true },
    });
  });

  it("nie wywołuje headers(), getSession ani redirect", async () => {
    memberRole("owner");

    await runWithRequestPrincipal(principal(), () => getOrgContext());

    expect(mockHeaders).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("sesja przeglądarki innego użytkownika i organizacji nie wpływa na kontekst principala", async () => {
    sessionOf({ userId: "u9", role: "superadmin", activeOrganizationId: "o9" });
    memberRole("member");

    await expect(
      runWithRequestPrincipal(principal(), () => getOrgContext()),
    ).resolves.toStrictEqual({
      userId: "u1",
      organizationId: "o1",
      orgRole: "member",
      userRole: "user",
      serviceMode: false,
    });
  });

  it("brak sesji przeglądarki nie przekierowuje pod principalem", async () => {
    mockGetSession.mockResolvedValue(null);
    memberRole("member");

    await expect(
      runWithRequestPrincipal(principal(), () => getOrgContext()),
    ).resolves.toMatchObject({ userId: "u1", organizationId: "o1" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("superadmin bez członkostwa w istniejącej organizacji → NoOrganizationError, nie tryb serwisowy", async () => {
    memberRole(null);

    await expect(
      runWithRequestPrincipal(principal("superadmin"), () => getOrgContext()),
    ).rejects.toBeInstanceOf(NoOrganizationError);
    expect(mockOrganization.findUnique).not.toHaveBeenCalled();
    expect(mockOrganization.findFirst).not.toHaveBeenCalled();
    expect(mockOrganization.count).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("globalny admin bez członkostwa → NoOrganizationError", async () => {
    memberRole(null);

    await expect(
      runWithRequestPrincipal(principal("admin"), () => getOrgContext()),
    ).rejects.toBeInstanceOf(NoOrganizationError);
  });

  it("usunięte członkostwo → NoOrganizationError przy następnym wywołaniu pod tym samym principalem", async () => {
    mockMemberFindFirst
      .mockResolvedValueOnce({ role: "admin" })
      .mockResolvedValueOnce(null);
    const p = principal();

    const outcome = await runWithRequestPrincipal(p, async () => {
      const first = await getOrgContext();
      const second = await getOrgContext().catch((error: unknown) => error);
      return { first, second };
    });

    expect(outcome.first).toMatchObject({ orgRole: "admin" });
    expect(outcome.second).toBeInstanceOf(NoOrganizationError);
    expect(mockMemberFindFirst).toHaveBeenCalledTimes(2);
  });

  it("zmiana roli z admin na member między wywołaniami → drugie zwraca member po drugim zapytaniu", async () => {
    mockMemberFindFirst
      .mockResolvedValueOnce({ role: "admin" })
      .mockResolvedValueOnce({ role: "member" });
    const p = principal();

    const roles = await runWithRequestPrincipal(p, async () => {
      const first = await getOrgContext();
      const second = await getOrgContext();
      return [first.orgRole, second.orgRole];
    });

    expect(roles).toEqual(["admin", "member"]);
    expect(mockMemberFindFirst).toHaveBeenCalledTimes(2);
  });

  it("zmiana roli między dwoma osobnymi wywołaniami runWithRequestPrincipal → świeża rola", async () => {
    memberRole("owner");
    await runWithRequestPrincipal(principal(), () => getOrgContext());
    memberRole("member");

    await expect(
      runWithRequestPrincipal(principal(), () => getOrgContext()),
    ).resolves.toMatchObject({ orgRole: "member" });
    expect(mockMemberFindFirst).toHaveBeenCalledTimes(2);
  });

  it.each<[UserRole]>([["user"], ["admin"], ["superadmin"]])(
    "zapisana rola konta %s → userRole user",
    async (accountRole) => {
      memberRole("owner");

      await expect(
        runWithRequestPrincipal(principal(accountRole), () => getOrgContext()),
      ).resolves.toStrictEqual({
        userId: "u1",
        organizationId: "o1",
        orgRole: "owner",
        userRole: "user",
        serviceMode: false,
      });
    },
  );

  it("nieznana rola członka zawężona do member", async () => {
    memberRole("customer_experience");

    await expect(
      runWithRequestPrincipal(principal(), () => getOrgContext()),
    ).resolves.toMatchObject({ orgRole: "member" });
  });

  it("awaria bazy przy odczycie członkostwa jest propagowana, nie zamieniana na NoOrganizationError", async () => {
    mockMemberFindFirst.mockRejectedValue(new Error("db down"));

    const error = await runWithRequestPrincipal(principal(), () =>
      getOrgContext().catch((caught: unknown) => caught),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(NoOrganizationError);
    expect((error as Error).message).toBe("db down");
  });
});

describe("uprawnienia z kontekstu principala (prawdziwe can i canAccessModule)", () => {
  it("konto superadmin, członek member → userRole user i orgRole member", async () => {
    memberRole("member");

    const context = await runWithRequestPrincipal(principal("superadmin"), () =>
      getOrgContext(),
    );

    expect(context.userRole).toBe("user");
    expect(context.orgRole).toBe("member");
  });

  it("konto superadmin, członek member → can uploads.delete-others false", async () => {
    memberRole("member");

    const context = await runWithRequestPrincipal(principal("superadmin"), () =>
      getOrgContext(),
    );

    expect(can(context, "uploads.delete-others")).toBe(false);
  });

  it("konto superadmin, członek member → brak dostępu do modułu audit-logs", async () => {
    memberRole("member");

    const context = await runWithRequestPrincipal(principal("superadmin"), () =>
      getOrgContext(),
    );

    expect(
      canAccessModule(auditLogsModule, {
        userRole: context.userRole,
        orgRole: context.orgRole,
        multiOrg: false,
      }),
    ).toBe(false);
    expect(
      canAccessModule(auditLogsModule, {
        userRole: context.userRole,
        orgRole: context.orgRole,
        multiOrg: true,
      }),
    ).toBe(false);
  });

  it("konto admin, członek member → can uploads.delete-others false", async () => {
    memberRole("member");

    const context = await runWithRequestPrincipal(principal("admin"), () =>
      getOrgContext(),
    );

    expect(can(context, "uploads.delete-others")).toBe(false);
  });

  it("konto admin, członek owner → can uploads.delete-others true", async () => {
    memberRole("owner");

    const context = await runWithRequestPrincipal(principal("admin"), () =>
      getOrgContext(),
    );

    expect(can(context, "uploads.delete-others")).toBe(true);
  });

  it("konto user, członek admin → dostęp do modułu audit-logs z roli w organizacji", async () => {
    memberRole("admin");

    const context = await runWithRequestPrincipal(principal(), () =>
      getOrgContext(),
    );

    expect(
      canAccessModule(auditLogsModule, {
        userRole: context.userRole,
        orgRole: context.orgRole,
        multiOrg: false,
      }),
    ).toBe(true);
  });
});

describe("getOrgContext bez principala (bez zmian)", () => {
  it("czyta sesję i zwraca rolę globalną z sesji", async () => {
    sessionOf({ userId: "u1", role: "admin", activeOrganizationId: "o1" });
    memberRole("owner");

    await expect(getOrgContext()).resolves.toStrictEqual({
      userId: "u1",
      organizationId: "o1",
      orgRole: "owner",
      userRole: "admin",
      serviceMode: false,
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockHeaders).toHaveBeenCalled();
  });

  it("brak sesji → przekierowanie na /sign-in", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/sign-in",
      locale: "en",
    });
  });

  it("superadmin bez członkostwa w istniejącej organizacji → tryb serwisowy", async () => {
    sessionOf({
      userId: "sa-1",
      role: "superadmin",
      activeOrganizationId: "o1",
    });
    memberRole(null);

    await expect(getOrgContext()).resolves.toStrictEqual({
      userId: "sa-1",
      organizationId: "o1",
      orgRole: "owner",
      userRole: "superadmin",
      serviceMode: true,
    });
  });

  it("po zakończeniu runWithRequestPrincipal kontekst znowu pochodzi z sesji", async () => {
    memberRole("member");
    await runWithRequestPrincipal(principal(), () => getOrgContext());
    sessionOf({ userId: "u7", role: "user", activeOrganizationId: "o7" });

    await expect(getOrgContext()).resolves.toMatchObject({
      userId: "u7",
      organizationId: "o7",
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});
