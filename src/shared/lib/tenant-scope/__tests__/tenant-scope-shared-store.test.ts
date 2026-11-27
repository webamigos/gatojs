// @vitest-environment node
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

const BYPASS_STORE_KEY = Symbol.for("gatojs.tenant-scope.bypass");

const isScoped = (model: string) => model === "Scoped";

async function loadModuleCopy() {
  vi.resetModules();
  const extension = await import("../tenant-scope-extension");
  const scope = await import("../tenant-scope");
  return {
    guardTenantQuery: extension.guardTenantQuery,
    withoutTenantScope: extension.withoutTenantScope,
    TenantScopeError: scope.TenantScopeError,
  };
}

type ModuleCopy = Awaited<ReturnType<typeof loadModuleCopy>>;

function unscopedQuery(
  copy: ModuleCopy,
  query: (args: unknown) => Promise<unknown>,
) {
  return copy.guardTenantQuery(
    { model: "Scoped", operation: "findMany", args: {}, query },
    isScoped,
  );
}

function clearSharedBypassStore() {
  Reflect.deleteProperty(globalThis, BYPASS_STORE_KEY);
}

let copyA: ModuleCopy;
let copyB: ModuleCopy;

beforeEach(async () => {
  clearSharedBypassStore();
  mockLogger.debug.mockReset();
  copyA = await loadModuleCopy();
  copyB = await loadModuleCopy();
});

afterEach(() => {
  clearSharedBypassStore();
  vi.resetModules();
});

describe("withoutTenantScope with several module copies in one process", () => {
  it("the copies are separate module instances", () => {
    expect(copyA.guardTenantQuery).not.toBe(copyB.guardTenantQuery);
    expect(copyA.withoutTenantScope).not.toBe(copyB.withoutTenantScope);
    expect(copyA.TenantScopeError).not.toBe(copyB.TenantScopeError);
  });

  it("copy A's bypass lets an unscoped query through copy B's guard and logs the reason", async () => {
    const query = vi.fn(async () => [{ id: "upload_1" }]);

    const result = await copyA.withoutTenantScope("reason", () =>
      unscopedQuery(copyB, query),
    );

    expect(result).toEqual([{ id: "upload_1" }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Query without organization filter inside withoutTenantScope",
      { model: "Scoped", operation: "findMany", reason: "reason" },
    );
  });

  it("copy B's bypass lets an unscoped query through copy A's guard and logs the reason", async () => {
    const query = vi.fn(async () => 5);

    const result = await copyB.withoutTenantScope("api key lookup", () =>
      unscopedQuery(copyA, query),
    );

    expect(result).toBe(5);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Query without organization filter inside withoutTenantScope",
      { model: "Scoped", operation: "findMany", reason: "api key lookup" },
    );
  });

  it("nested bypasses from different copies log the reason of the innermost bypass", async () => {
    const query = vi.fn(async () => []);

    await copyA.withoutTenantScope("outer", async () => {
      await copyB.withoutTenantScope("inner", () =>
        unscopedQuery(copyA, query),
      );
      await unscopedQuery(copyB, query);
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(mockLogger.debug.mock.calls.map((call) => call[1])).toEqual([
      { model: "Scoped", operation: "findMany", reason: "inner" },
      { model: "Scoped", operation: "findMany", reason: "outer" },
    ]);
  });

  it("copy B's guard outside a bypass rejects an unscoped query with TenantScopeError and does not run it", async () => {
    const query = vi.fn(async () => [{ id: "row" }]);

    const result = unscopedQuery(copyB, query);

    await expect(result).rejects.toBeInstanceOf(copyB.TenantScopeError);
    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "Scoped",
      operation: "findMany",
    });
    expect(query).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it("copy A's guard outside a bypass rejects an unscoped query with TenantScopeError and does not run it", async () => {
    const query = vi.fn(async () => 1);

    await expect(
      copyA.guardTenantQuery(
        {
          model: "Scoped",
          operation: "deleteMany",
          args: { where: { id: "x" } },
          query,
        },
        isScoped,
      ),
    ).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "Scoped",
      operation: "deleteMany",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("after copy A's withoutTenantScope returns, copy B's guard rejects again", async () => {
    const query = vi.fn(async () => []);
    await expect(
      copyA.withoutTenantScope("reason", async () => "done"),
    ).resolves.toBe("done");

    await expect(unscopedQuery(copyB, query)).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "Scoped",
      operation: "findMany",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("after fn throws in copy A's withoutTenantScope, copy B's guard rejects again", async () => {
    const query = vi.fn(async () => []);
    await expect(
      copyA.withoutTenantScope("reason", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(unscopedQuery(copyB, query)).rejects.toBeInstanceOf(
      copyB.TenantScopeError,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("copy A's bypass does not leak into a parallel chain through copy B's guard", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const query = vi.fn(async () => []);

    const exempt = copyA.withoutTenantScope("reason", async () => {
      await gate;
      return "done";
    });
    const outside = unscopedQuery(copyB, query);
    release();

    await expect(outside).rejects.toBeInstanceOf(copyB.TenantScopeError);
    await expect(exempt).resolves.toBe("done");
    expect(query).not.toHaveBeenCalled();
  });

  it("a query with an organization filter passes copy B's guard without a bypass with unchanged args", async () => {
    const args = { where: { organizationId: "org_a" } };
    const query = vi.fn<(args: unknown) => Promise<number>>(async () => 2);

    const result = await copyB.guardTenantQuery(
      { model: "Scoped", operation: "count", args, query },
      isScoped,
    );

    expect(result).toBe(2);
    expect(query.mock.calls[0]?.[0]).toBe(args);
  });
  it("a copy uses the bypass store already registered under the gatojs.tenant-scope.bypass global key", async () => {
    clearSharedBypassStore();
    const injected = new AsyncLocalStorage<{ reason: string }>();
    Reflect.set(globalThis, Symbol.for("gatojs.tenant-scope.bypass"), injected);
    const copy = await loadModuleCopy();
    const insideQuery = vi.fn(async () => [{ id: "row" }]);
    const outsideQuery = vi.fn(async () => []);

    const result = await injected.run({ reason: "preexisting" }, () =>
      unscopedQuery(copy, insideQuery),
    );

    expect(result).toEqual([{ id: "row" }]);
    expect(insideQuery).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Query without organization filter inside withoutTenantScope",
      { model: "Scoped", operation: "findMany", reason: "preexisting" },
    );
    await expect(unscopedQuery(copy, outsideQuery)).rejects.toBeInstanceOf(
      copy.TenantScopeError,
    );
    expect(outsideQuery).not.toHaveBeenCalled();
  });
});
