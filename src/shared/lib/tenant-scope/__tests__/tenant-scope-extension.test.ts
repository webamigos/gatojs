// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

import {
  TenantScopeError,
  isTenantScoped,
  withoutTenantScope,
} from "@/shared/lib/tenant-scope";
import { TenantScopeError as DirectTenantScopeError } from "../tenant-scope";
import {
  guardTenantQuery,
  tenantScopeExtension,
  withoutTenantScope as directWithoutTenantScope,
} from "../tenant-scope-extension";

const isScoped = (model: string) => model === "Scoped";

function unscopedQuery(query: (args: unknown) => Promise<unknown>) {
  return guardTenantQuery(
    { model: "Scoped", operation: "findMany", args: {}, query },
    isScoped,
  );
}

function lazy<T>(run: () => Promise<T>): Promise<T> {
  const thenable = {
    then<R1, R2>(
      onFulfilled: (value: T) => R1 | PromiseLike<R1>,
      onRejected: (reason: unknown) => R2 | PromiseLike<R2>,
    ) {
      return run().then(onFulfilled, onRejected);
    },
  };
  return thenable as unknown as Promise<T>;
}

type AllOperationsHook = (params: {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      typeof current === "object" && current !== null
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );
}

function registeredExtension(): unknown {
  let captured: unknown;
  const fakeClient = {
    $extends: (extension: unknown) => {
      captured = extension;
      return extension;
    },
  };
  (tenantScopeExtension as unknown as (client: unknown) => unknown)(fakeClient);
  return captured;
}

function registeredAllOperationsHook(): AllOperationsHook {
  const hook = readPath(registeredExtension(), [
    "query",
    "$allModels",
    "$allOperations",
  ]);
  if (typeof hook !== "function") {
    throw new Error(
      "rozszerzenie nie rejestruje query.$allModels.$allOperations",
    );
  }
  return hook as AllOperationsHook;
}

beforeEach(() => {
  mockLogger.debug.mockReset();
  mockLogger.warn.mockReset();
});

describe("index tenant-scope", () => {
  it("re-eksportuje withoutTenantScope, TenantScopeError i isTenantScoped", () => {
    expect(withoutTenantScope).toBe(directWithoutTenantScope);
    expect(TenantScopeError).toBe(DirectTenantScopeError);
    expect(isTenantScoped("Member")).toBe(false);
  });
});

describe("tenantScopeExtension", () => {
  it("rejestruje rozszerzenie o nazwie tenant-scope", () => {
    expect(readPath(registeredExtension(), ["name"])).toBe("tenant-scope");
  });

  it("zapytanie ApiKey bez filtra organizacji przez klienta z rozszerzeniem jest odrzucone i nie trafia do bazy", async () => {
    const query = vi.fn(async () => [{ id: "k" }]);

    const result = registeredAllOperationsHook()({
      model: "ApiKey",
      operation: "findMany",
      args: {},
      query,
    });

    await expect(result).rejects.toBeInstanceOf(TenantScopeError);
    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "ApiKey",
      operation: "findMany",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("zapytanie ApiKey z filtrem organizacji przechodzi z tym samym obiektem args", async () => {
    const args = { where: { organizationId: "org_a" } };
    const query = vi.fn<(args: unknown) => Promise<{ id: string }[]>>(
      async () => [{ id: "k" }],
    );

    const result = await registeredAllOperationsHook()({
      model: "ApiKey",
      operation: "findMany",
      args,
      query,
    });

    expect(result).toEqual([{ id: "k" }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(args);
  });

  it("zapytanie Member bez filtra organizacji przez klienta z rozszerzeniem przechodzi", async () => {
    const args = {};
    const query = vi.fn<(args: unknown) => Promise<number>>(async () => 4);

    const result = await registeredAllOperationsHook()({
      model: "Member",
      operation: "count",
      args,
      query,
    });

    expect(result).toBe(4);
    expect(query.mock.calls[0]?.[0]).toBe(args);
  });
});

describe("guardTenantQuery", () => {
  it("model objęty guardem bez filtra jest odrzucony TenantScopeError i nie trafia do bazy", async () => {
    const query = vi.fn(async () => [{ id: "row" }]);

    const result = guardTenantQuery(
      { model: "Scoped", operation: "findMany", args: {}, query },
      isScoped,
    );

    await expect(result).rejects.toBeInstanceOf(TenantScopeError);
    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "Scoped",
      operation: "findMany",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("odrzucenie niesie model i operację zapytania", async () => {
    const query = vi.fn(async () => 1);

    await expect(
      guardTenantQuery(
        {
          model: "Scoped",
          operation: "deleteMany",
          args: { where: { id: "x" } },
          query,
        },
        isScoped,
      ),
    ).rejects.toMatchObject({ model: "Scoped", operation: "deleteMany" });
    expect(query).not.toHaveBeenCalled();
  });

  it("odrzucenie nie jest tylko ostrzeżeniem w logu", async () => {
    const query = vi.fn(async () => []);

    await expect(unscopedQuery(query)).rejects.toThrow(TenantScopeError);
    expect(query).not.toHaveBeenCalled();
  });

  it("model objęty guardem z filtrem przechodzi z niezmienionymi args", async () => {
    const args = { where: { organizationId: "org_a" } };
    const query = vi.fn<(args: unknown) => Promise<{ id: string }[]>>(
      async () => [{ id: "row" }],
    );

    const result = await guardTenantQuery(
      { model: "Scoped", operation: "findMany", args, query },
      isScoped,
    );

    expect(result).toEqual([{ id: "row" }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(args);
    expect(args).toEqual({ where: { organizationId: "org_a" } });
  });

  it("model poza guardem przechodzi bez filtra z niezmienionymi args", async () => {
    const args = {};
    const query = vi.fn<(args: unknown) => Promise<number>>(async () => 7);

    const result = await guardTenantQuery(
      { model: "Free", operation: "count", args, query },
      isScoped,
    );

    expect(result).toBe(7);
    expect(query.mock.calls[0]?.[0]).toBe(args);
  });

  it("błąd zapytania z filtrem jest propagowany bez zmiany", async () => {
    const failure = new Error("baza niedostępna");
    const query = vi.fn(async () => {
      throw failure;
    });

    await expect(
      guardTenantQuery(
        {
          model: "Scoped",
          operation: "findMany",
          args: { where: { organizationId: "org_a" } },
          query,
        },
        isScoped,
      ),
    ).rejects.toBe(failure);
  });

  it("domyślnie Member bez filtra organizacji przechodzi", async () => {
    const query = vi.fn(async () => [{ id: "m" }]);

    const result = await guardTenantQuery({
      model: "Member",
      operation: "findMany",
      args: { where: { userId: "u" } },
      query,
    });

    expect(result).toEqual([{ id: "m" }]);
  });

  it("domyślnie Invitation i User bez filtra organizacji przechodzą", async () => {
    const query = vi.fn(async () => 1);

    await expect(
      guardTenantQuery({
        model: "Invitation",
        operation: "count",
        args: {},
        query,
      }),
    ).resolves.toBe(1);
    await expect(
      guardTenantQuery({ model: "User", operation: "count", args: {}, query }),
    ).resolves.toBe(1);
  });
});

describe("withoutTenantScope", () => {
  it("wewnątrz przepuszcza zapytanie bez filtra i loguje model, operację i powód", async () => {
    const query = vi.fn(async () => [{ id: "a" }, { id: "b" }]);

    const result = await withoutTenantScope("lookup by hash", () =>
      unscopedQuery(query),
    );

    expect(result).toEqual([{ id: "a" }, { id: "b" }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Zapytanie bez filtra organizacji w withoutTenantScope",
      {
        model: "Scoped",
        operation: "findMany",
        reason: "lookup by hash",
      },
    );
  });

  it("zwraca wartość fn", async () => {
    await expect(withoutTenantScope("r", async () => 42)).resolves.toBe(42);
  });

  it("pusty powód jest odrzucony, a fn nie jest wywołane", async () => {
    const fn = vi.fn(async () => 1);

    await expect(withoutTenantScope("", fn)).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it("pusty albo biały powód jest odrzucony komunikatem o wymaganym powodzie", async () => {
    const fn = vi.fn(async () => 1);

    await expect(withoutTenantScope("", fn)).rejects.toMatchObject({
      message: "withoutTenantScope wymaga niepustego powodu",
    });
    await expect(withoutTenantScope(" \t", fn)).rejects.toMatchObject({
      message: "withoutTenantScope wymaga niepustego powodu",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("powód z samych białych znaków jest odrzucony, a fn nie jest wywołane", async () => {
    const fn = vi.fn(async () => 1);

    await expect(withoutTenantScope("   ", fn)).rejects.toThrow();
    await expect(withoutTenantScope("\n\t", fn)).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it("błąd fn jest propagowany", async () => {
    await expect(
      withoutTenantScope("r", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
  });

  it("po zakończeniu guard znów odrzuca zapytanie bez filtra", async () => {
    const query = vi.fn(async () => []);
    await withoutTenantScope("r", async () => undefined);

    await expect(unscopedQuery(query)).rejects.toBeInstanceOf(TenantScopeError);
    expect(query).not.toHaveBeenCalled();
  });

  it("po błędzie fn guard znów odrzuca zapytanie bez filtra", async () => {
    const query = vi.fn(async () => []);
    await expect(
      withoutTenantScope("r", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");

    await expect(unscopedQuery(query)).rejects.toBeInstanceOf(TenantScopeError);
    expect(query).not.toHaveBeenCalled();
  });

  it("po synchronicznym wyjątku fn guard znów odrzuca zapytanie bez filtra", async () => {
    const query = vi.fn(async () => []);
    await expect(
      withoutTenantScope("r", () => {
        throw new Error("sync");
      }),
    ).rejects.toThrow("sync");

    await expect(unscopedQuery(query)).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("zagnieżdżenie: wewnętrzne wywołanie loguje swój powód, zewnętrzne działa dalej po nim", async () => {
    const query = vi.fn(async () => []);

    await withoutTenantScope("outer", async () => {
      await withoutTenantScope("inner", () => unscopedQuery(query));
      await unscopedQuery(query);
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(mockLogger.debug.mock.calls.map((call) => call[1])).toEqual([
      { model: "Scoped", operation: "findMany", reason: "inner" },
      { model: "Scoped", operation: "findMany", reason: "outer" },
    ]);
  });

  it("zagnieżdżenie: po wyjściu z obu guard znów odrzuca", async () => {
    const query = vi.fn(async () => []);
    await withoutTenantScope("outer", () =>
      withoutTenantScope("inner", async () => undefined),
    );

    await expect(unscopedQuery(query)).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("zagnieżdżenie z pustym powodem wewnątrz jest odrzucone mimo zewnętrznego zwolnienia", async () => {
    const fn = vi.fn(async () => 1);

    await expect(
      withoutTenantScope("outer", () => withoutTenantScope("", fn)),
    ).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it("zwolnienie nie przecieka do równoległego łańcucha poza withoutTenantScope", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const query = vi.fn(async () => []);

    const exempt = withoutTenantScope("r", async () => {
      await gate;
      return "done";
    });
    const outside = unscopedQuery(query);
    release();

    await expect(outside).rejects.toBeInstanceOf(TenantScopeError);
    await expect(exempt).resolves.toBe("done");
    expect(query).not.toHaveBeenCalled();
  });

  it("leniwy wynik fn jest wykonany wewnątrz zwolnienia", async () => {
    const query = vi.fn(async () => 3);

    const result = await withoutTenantScope("lazy", () =>
      lazy(() => unscopedQuery(query)),
    );

    expect(result).toBe(3);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("zapytanie z filtrem wewnątrz zwolnienia przechodzi z niezmienionymi args", async () => {
    const args = { where: { organizationId: "org_a" } };
    const query = vi.fn<(args: unknown) => Promise<number>>(async () => 1);

    await withoutTenantScope("r", () =>
      guardTenantQuery(
        { model: "Scoped", operation: "count", args, query },
        isScoped,
      ),
    );

    expect(query.mock.calls[0]?.[0]).toBe(args);
  });
});
