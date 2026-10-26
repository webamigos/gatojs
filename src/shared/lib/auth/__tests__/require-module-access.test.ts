import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOrgContext, mockNotFound, mockEnv } = vi.hoisted(() => ({
  mockGetOrgContext: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  mockEnv: { MULTI_ORG: false },
}));

vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("../org-context", () => ({ getOrgContext: mockGetOrgContext }));
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
});
