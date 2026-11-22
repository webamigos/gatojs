// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TenantScopeError, isTenantScoped } from "@/shared/lib/tenant-scope";
import { guardTenantQuery } from "@/shared/lib/tenant-scope/tenant-scope-extension";

describe("AuditLog pod guardem organizacji", () => {
  it("model AuditLog jest objęty guardem", () => {
    expect(isTenantScoped("AuditLog")).toBe(true);
  });

  it("domyślny guard odrzuca AuditLog.count bez filtra i nie woła bazy", async () => {
    const query = vi.fn(async () => 0);

    await expect(
      guardTenantQuery({
        model: "AuditLog",
        operation: "count",
        args: {},
        query,
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    expect(query).not.toHaveBeenCalled();
  });
});
