// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TenantScopeError, isTenantScoped } from "@/shared/lib/tenant-scope";
import { guardTenantQuery } from "@/shared/lib/tenant-scope/tenant-scope-extension";

describe("Upload pod guardem organizacji", () => {
  it("model Upload jest objęty guardem", () => {
    expect(isTenantScoped("Upload")).toBe(true);
  });

  it("domyślny guard odrzuca Upload.findUnique po samym id i nie woła bazy", async () => {
    const query = vi.fn(async () => null);

    await expect(
      guardTenantQuery({
        model: "Upload",
        operation: "findUnique",
        args: { where: { id: "u" } },
        query,
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    expect(query).not.toHaveBeenCalled();
  });
});
