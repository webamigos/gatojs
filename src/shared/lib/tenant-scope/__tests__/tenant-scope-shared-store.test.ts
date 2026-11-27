// @vitest-environment node
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

describe("withoutTenantScope przy kilku kopiach modułu w jednym procesie", () => {
  it("kopie są osobnymi instancjami modułu", () => {
    expect(copyA.guardTenantQuery).not.toBe(copyB.guardTenantQuery);
    expect(copyA.withoutTenantScope).not.toBe(copyB.withoutTenantScope);
    expect(copyA.TenantScopeError).not.toBe(copyB.TenantScopeError);
  });

  it("zwolnienie kopii A przepuszcza zapytanie bez filtra przez guard kopii B i loguje powód", async () => {
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

  it("zwolnienie kopii B przepuszcza zapytanie bez filtra przez guard kopii A i loguje powód", async () => {
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

  it("zagnieżdżone zwolnienia z różnych kopii logują powód najbliższego zwolnienia", async () => {
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

  it("guard kopii B poza zwolnieniem odrzuca zapytanie bez filtra TenantScopeError i nie wywołuje zapytania", async () => {
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

  it("guard kopii A poza zwolnieniem odrzuca zapytanie bez filtra TenantScopeError i nie wywołuje zapytania", async () => {
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

  it("po powrocie z withoutTenantScope kopii A guard kopii B znów odrzuca", async () => {
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

  it("po błędzie fn w withoutTenantScope kopii A guard kopii B znów odrzuca", async () => {
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

  it("zwolnienie kopii A nie przecieka do równoległego łańcucha guarda kopii B", async () => {
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

  it("zapytanie z filtrem organizacji przez guard kopii B przechodzi bez zwolnienia z niezmienionymi args", async () => {
    const args = { where: { organizationId: "org_a" } };
    const query = vi.fn<(args: unknown) => Promise<number>>(async () => 2);

    const result = await copyB.guardTenantQuery(
      { model: "Scoped", operation: "count", args, query },
      isScoped,
    );

    expect(result).toBe(2);
    expect(query.mock.calls[0]?.[0]).toBe(args);
  });
});
