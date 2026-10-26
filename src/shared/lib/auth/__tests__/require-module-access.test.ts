import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOrgContext, mockNotFound, mockEnv, mockRedirect } = vi.hoisted(
  () => ({
    mockGetOrgContext: vi.fn(),
    mockRedirect: vi.fn((args: unknown) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { args });
    }),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    mockEnv: { MULTI_ORG: false },
  }),
);

vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("../org-context", () => {
  class NoOrganizationError extends Error {}
  return { NoOrganizationError, getOrgContext: mockGetOrgContext };
});
vi.mock("@/modules.client.generated", () => ({
  clientModules: [
    { key: "open", nav: [], routePrefixes: ["/open"] },
    { key: "secret", nav: [], routePrefixes: ["/secret"], adminOnly: true },
    {
      key: "owners",
      nav: [],
      routePrefixes: ["/owners"],
      roles: ["owner"],
    },
  ],
}));

import { NoOrganizationError } from "../org-context";
import { requireModuleAccess } from "../require-module-access";

function asContext(orgRole: string, userRole = "user") {
  mockGetOrgContext.mockResolvedValue({
    userId: "u1",
    organizationId: "org-1",
    orgRole,
    userRole,
  });
}

describe("requireModuleAccess", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
  });

  it("member wchodzi do modułu bez ograniczeń", async () => {
    asContext("member");
    await expect(requireModuleAccess("open")).resolves.toMatchObject({
      userId: "u1",
    });
  });

  it("member jest odrzucany z modułu adminOnly", async () => {
    asContext("member");
    await expect(requireModuleAccess("secret")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("member jest odrzucany przy niezgodności roles", async () => {
    asContext("member");
    await expect(requireModuleAccess("owners")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("owner przechodzi guard roles", async () => {
    asContext("owner");
    await expect(requireModuleAccess("owners")).resolves.toBeDefined();
  });

  it("globalny admin wchodzi do modułu adminOnly", async () => {
    asContext("member", "admin");
    await expect(requireModuleAccess("secret")).resolves.toBeDefined();
  });

  it("nieznany moduł jest odrzucany", async () => {
    asContext("owner", "admin");
    await expect(requireModuleAccess("missing")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("brak organizacji → przekierowanie na /no-organization w bieżącym języku", async () => {
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());

    await expect(requireModuleAccess("open")).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/no-organization",
      locale: "en",
    });
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("inny błąd kontekstu jest propagowany", async () => {
    mockGetOrgContext.mockRejectedValue(new Error("db down"));

    await expect(requireModuleAccess("open")).rejects.toThrow("db down");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
