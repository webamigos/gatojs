// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TenantScopeError, isTenantScoped } from "@/shared/lib/tenant-scope";
import { guardTenantQuery } from "@/shared/lib/tenant-scope/tenant-scope-extension";

describe("OrganizationDataKey under the organization guard", () => {
  it("covers the OrganizationDataKey model", () => {
    expect(isTenantScoped("OrganizationDataKey")).toBe(true);
  });

  it("rejects OrganizationDataKey.findMany without a filter and does not query the database", async () => {
    const query = vi.fn(async () => []);

    await expect(
      guardTenantQuery({
        model: "OrganizationDataKey",
        operation: "findMany",
        args: {},
        query,
      }),
    ).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "OrganizationDataKey",
      operation: "findMany",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects OrganizationDataKey.findUnique by id alone", async () => {
    const query = vi.fn(async () => null);

    await expect(
      guardTenantQuery({
        model: "OrganizationDataKey",
        operation: "findUnique",
        args: { where: { id: "key-1" } },
        query,
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    expect(query).not.toHaveBeenCalled();
  });

  it("passes OrganizationDataKey.findUnique filtered by organizationId through to the query once", async () => {
    const row = { id: "key-1", organizationId: "org-a" };
    const query = vi.fn(async () => row);
    const args = { where: { organizationId: "org-a" } };

    await expect(
      guardTenantQuery({
        model: "OrganizationDataKey",
        operation: "findUnique",
        args,
        query,
      }),
    ).resolves.toBe(row);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ where: { organizationId: "org-a" } });
  });
});
