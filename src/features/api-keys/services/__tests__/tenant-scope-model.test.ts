// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TenantScopeError, isTenantScoped } from "@/shared/lib/tenant-scope";
import { guardTenantQuery } from "@/shared/lib/tenant-scope/tenant-scope-extension";

describe("ApiKey pod guardem organizacji", () => {
  it("model ApiKey jest objęty guardem", () => {
    expect(isTenantScoped("ApiKey")).toBe(true);
  });

  it("domyślny guard odrzuca ApiKey.findMany bez filtra i nie woła bazy", async () => {
    const query = vi.fn(async () => []);

    await expect(
      guardTenantQuery({
        model: "ApiKey",
        operation: "findMany",
        args: {},
        query,
      }),
    ).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "ApiKey",
      operation: "findMany",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("domyślny guard odrzuca ApiKey.findUnique po samym hashedKey", async () => {
    const query = vi.fn(async () => null);

    await expect(
      guardTenantQuery({
        model: "ApiKey",
        operation: "findUnique",
        args: { where: { hashedKey: "h" } },
        query,
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    expect(query).not.toHaveBeenCalled();
  });
});
