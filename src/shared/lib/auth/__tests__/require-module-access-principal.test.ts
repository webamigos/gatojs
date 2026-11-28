import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSession,
  mockMemberFindFirst,
  mockRedirect,
  mockNotFound,
  mockEnv,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockMemberFindFirst: vi.fn(),
  mockRedirect: vi.fn((args: unknown) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { args });
  }),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  mockEnv: { MULTI_ORG: false },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "en") }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    member: { findFirst: mockMemberFindFirst },
    organization: {
      findUnique: vi.fn(async () => ({ id: "o1", name: "Organizacja o1" })),
      findFirst: vi.fn(async () => ({ id: "o1", name: "Organizacja o1" })),
      count: vi.fn(async () => 1),
    },
  },
}));

import { ModuleAccessDeniedError } from "../module-access-denied-error";
import { NoOrganizationError } from "../org-context";
import {
  runWithRequestPrincipal,
  type RequestPrincipal,
} from "../request-principal";
import { requireModuleAccess } from "../require-module-access";
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

function underPrincipal(moduleKey: string, accountRole: UserRole = "user") {
  return runWithRequestPrincipal(principal(accountRole), () =>
    requireModuleAccess(moduleKey).catch((error: unknown) => error),
  );
}

beforeEach(() => {
  mockEnv.MULTI_ORG = false;
  mockGetSession.mockReset();
  mockMemberFindFirst.mockReset();
  mockRedirect.mockClear();
  mockNotFound.mockClear();
});

describe("ModuleAccessDeniedError", () => {
  it("ma nazwę, klucz modułu i komunikat", () => {
    const error = new ModuleAccessDeniedError("audit-logs");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ModuleAccessDeniedError");
    expect(error.moduleKey).toBe("audit-logs");
    expect(error.message).toBe("Module access denied: audit-logs");
  });
});

describe("requireModuleAccess pod principalem żądania", () => {
  it("member → audit-logs rzuca ModuleAccessDeniedError, nie notFound()", async () => {
    memberRole("member");

    const error = await underPrincipal("audit-logs");

    expect(error).toBeInstanceOf(ModuleAccessDeniedError);
    expect((error as ModuleAccessDeniedError).name).toBe(
      "ModuleAccessDeniedError",
    );
    expect((error as ModuleAccessDeniedError).moduleKey).toBe("audit-logs");
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("konto superadmin z rolą member → audit-logs nadal odrzucony", async () => {
    memberRole("member");

    const error = await underPrincipal("audit-logs", "superadmin");

    expect(error).toBeInstanceOf(ModuleAccessDeniedError);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("konto admin z rolą member → audit-logs nadal odrzucony", async () => {
    memberRole("member");

    const error = await underPrincipal("audit-logs", "admin");

    expect(error).toBeInstanceOf(ModuleAccessDeniedError);
  });

  it("nieznany moduł → ModuleAccessDeniedError z kluczem modułu", async () => {
    memberRole("owner");

    const error = await underPrincipal("unknown-module");

    expect(error).toBeInstanceOf(ModuleAccessDeniedError);
    expect((error as ModuleAccessDeniedError).moduleKey).toBe("unknown-module");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("moduł adminOnly users dla konta superadmin z rolą owner → ModuleAccessDeniedError", async () => {
    memberRole("owner");

    const error = await underPrincipal("users", "superadmin");

    expect(error).toBeInstanceOf(ModuleAccessDeniedError);
    expect((error as ModuleAccessDeniedError).moduleKey).toBe("users");
  });

  it("brak członkostwa → NoOrganizationError przechodzi bez przekierowania", async () => {
    memberRole(null);

    const error = await underPrincipal("audit-logs");

    expect(error).toBeInstanceOf(NoOrganizationError);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("awaria bazy jest propagowana bez zamiany na odmowę dostępu", async () => {
    mockMemberFindFirst.mockRejectedValue(new Error("db down"));

    const error = await underPrincipal("audit-logs");

    expect(error).not.toBeInstanceOf(ModuleAccessDeniedError);
    expect((error as Error).message).toBe("db down");
  });

  it("owner → audit-logs zwraca kontekst", async () => {
    memberRole("owner");

    await expect(underPrincipal("audit-logs", "admin")).resolves.toStrictEqual({
      userId: "u1",
      organizationId: "o1",
      orgRole: "owner",
      userRole: "user",
      serviceMode: false,
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("zapisana rola członka admin → audit-logs zwraca kontekst", async () => {
    memberRole("admin");

    await expect(underPrincipal("audit-logs")).resolves.toStrictEqual({
      userId: "u1",
      organizationId: "o1",
      orgRole: "admin",
      userRole: "user",
      serviceMode: false,
    });
  });
});

describe("requireModuleAccess bez principala (bez zmian)", () => {
  function sessionOf(role: string) {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role },
      session: { id: "s-1", activeOrganizationId: "o1" },
    });
  }

  it("member → audit-logs kończy się notFound(), nie ModuleAccessDeniedError", async () => {
    sessionOf("user");
    memberRole("member");

    const error = await requireModuleAccess("audit-logs").catch(
      (caught: unknown) => caught,
    );

    expect(error).not.toBeInstanceOf(ModuleAccessDeniedError);
    expect((error as Error).message).toBe("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("nieznany moduł → notFound()", async () => {
    sessionOf("user");
    memberRole("owner");

    await expect(requireModuleAccess("unknown-module")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("brak członkostwa → przekierowanie na /no-organization", async () => {
    sessionOf("user");
    memberRole(null);

    await expect(requireModuleAccess("audit-logs")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/no-organization",
      locale: "en",
    });
  });

  it("globalny admin z rolą member → audit-logs zwraca kontekst z sesji", async () => {
    sessionOf("admin");
    memberRole("member");

    await expect(requireModuleAccess("audit-logs")).resolves.toStrictEqual({
      userId: "u1",
      organizationId: "o1",
      orgRole: "member",
      userRole: "admin",
      serviceMode: false,
    });
  });
});
