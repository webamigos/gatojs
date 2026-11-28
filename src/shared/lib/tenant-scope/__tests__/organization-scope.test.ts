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

import {
  currentOrganizationScope as indexCurrentOrganizationScope,
  runInOrganizationScope as indexRunInOrganizationScope,
} from "@/shared/lib/tenant-scope";
import {
  currentOrganizationScope,
  runInOrganizationScope,
} from "../organization-scope";
import { TenantScopeError } from "../tenant-scope";
import {
  guardTenantQuery,
  withoutTenantScope,
} from "../tenant-scope-extension";

const isScoped = (model: string) => model === "Scoped";
const hasOrganization = (model: string) => model === "Scoped";

function guardFake(
  operation: string,
  args: unknown,
  query: (args: unknown) => Promise<unknown>,
  model = "Scoped",
) {
  return guardTenantQuery(
    { model, operation, args, query },
    isScoped,
    hasOrganization,
  );
}

function guardReal(
  model: string,
  operation: string,
  args: unknown,
  query: (args: unknown) => Promise<unknown>,
) {
  return guardTenantQuery({ model, operation, args, query });
}

beforeEach(() => {
  mockLogger.debug.mockReset();
});

describe("runInOrganizationScope i currentOrganizationScope", () => {
  it("poza zakresem currentOrganizationScope zwraca undefined", () => {
    expect(currentOrganizationScope()).toBeUndefined();
  });

  it("w zakresie zwraca id organizacji, także po await, i przekazuje wynik fn", async () => {
    const seen: Array<string | undefined> = [];

    const result = await runInOrganizationScope("org-a", async () => {
      seen.push(currentOrganizationScope());
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(currentOrganizationScope());
      return "wynik";
    });

    expect(result).toBe("wynik");
    expect(seen).toEqual(["org-a", "org-a"]);
    expect(currentOrganizationScope()).toBeUndefined();
  });

  it("odrzucenie fn przechodzi dalej, a zakres się zamyka", async () => {
    await expect(
      runInOrganizationScope("org-a", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(currentOrganizationScope()).toBeUndefined();
  });

  it.each(["", "  "])(
    "id %j odrzuca błędem i nie wywołuje fn",
    async (organizationId) => {
      const fn = vi.fn(async () => "x");

      const result = runInOrganizationScope(organizationId, fn);

      await expect(result).rejects.toThrow(
        new Error("runInOrganizationScope needs an organization id"),
      );
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it("zagnieżdżony zakres innej organizacji odrzuca i nie wywołuje wewnętrznej fn", async () => {
    const inner = vi.fn(async () => "x");
    let afterRejection: string | undefined;

    await runInOrganizationScope("org-a", async () => {
      await expect(runInOrganizationScope("org-b", inner)).rejects.toThrow(
        new Error(
          "runInOrganizationScope cannot switch organization inside an organization job",
        ),
      );
      afterRejection = currentOrganizationScope();
    });

    expect(inner).not.toHaveBeenCalled();
    expect(afterRejection).toBe("org-a");
  });

  it("zagnieżdżony zakres tej samej organizacji wykonuje fn", async () => {
    const result = await runInOrganizationScope("org-a", () =>
      runInOrganizationScope("org-a", async () => currentOrganizationScope()),
    );

    expect(result).toBe("org-a");
  });

  it("zakres nie przecieka do równoległego łańcucha async", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const query = vi.fn(async () => []);

    const scoped = runInOrganizationScope("org-a", async () => {
      await gate;
      return currentOrganizationScope();
    });
    const outsideScope = currentOrganizationScope();
    const outsideQuery = guardFake(
      "findMany",
      { where: { organizationId: "org-b" } },
      query,
    );
    release();

    await expect(scoped).resolves.toBe("org-a");
    await expect(outsideQuery).resolves.toEqual([]);
    expect(outsideScope).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("indeks tenant-scope eksportuje runInOrganizationScope i currentOrganizationScope", () => {
    expect(indexRunInOrganizationScope).toBe(runInOrganizationScope);
    expect(indexCurrentOrganizationScope).toBe(currentOrganizationScope);
  });
});

describe("guard w zakresie organizacji zadania: zapytania w org-a przechodzą", () => {
  it.each([
    ["findMany", { where: { organizationId: "org-a" } }],
    ["findMany", { where: { organizationId: { equals: "org-a" } } }],
    ["findMany", { where: { organizationId: { in: ["org-a"] } } }],
    [
      "findMany",
      { where: { AND: [{ organizationId: "org-a" }, { id: "x" }] } },
    ],
    [
      "findUnique",
      {
        where: { organizationId_slug: { organizationId: "org-a", slug: "s" } },
      },
    ],
    ["create", { data: { organizationId: "org-a" } }],
    [
      "createMany",
      { data: [{ organizationId: "org-a" }, { organizationId: "org-a" }] },
    ],
    [
      "update",
      { where: { id: "x", organizationId: "org-a" }, data: { name: "n" } },
    ],
    [
      "upsert",
      {
        where: { id: "x", organizationId: "org-a" },
        create: { organizationId: "org-a", name: "n" },
        update: { name: "n" },
      },
    ],
  ])(
    "%s z %j wywołuje query raz z niezmienionymi args",
    async (operation, args) => {
      const query = vi.fn<(args: unknown) => Promise<unknown>>(
        async () => "ok",
      );

      const result = await runInOrganizationScope("org-a", () =>
        guardFake(operation, args, query),
      );

      expect(result).toBe("ok");
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]?.[0]).toBe(args);
    },
  );
});

describe("guard w zakresie organizacji zadania: zapytania poza org-a są odrzucane", () => {
  it.each([
    ["findMany", { where: { organizationId: "org-b" } }, "scoped.findMany"],
    [
      "findMany",
      { where: { organizationId: { equals: "org-b" } } },
      "scoped.findMany",
    ],
    [
      "findMany",
      { where: { organizationId: { in: ["org-a", "org-b"] } } },
      "scoped.findMany",
    ],
    [
      "findMany",
      { where: { organizationId: { in: ["org-b", "org-a"] } } },
      "scoped.findMany",
    ],
    [
      "findMany",
      { where: { organizationId: { not: "org-b" } } },
      "scoped.findMany",
    ],
    ["findMany", { where: { organizationId: { in: [] } } }, "scoped.findMany"],
    ["findMany", {}, "scoped.findMany"],
    ["findMany", { where: {} }, "scoped.findMany"],
    ["findMany", { where: { id: "x" } }, "scoped.findMany"],
    [
      "findMany",
      {
        where: {
          OR: [{ organizationId: "org-a" }, { organizationId: "org-b" }],
        },
      },
      "scoped.findMany",
    ],
    ["create", { data: { organizationId: "org-b" } }, "scoped.create"],
    ["create", { data: { name: "n" } }, "scoped.create"],
    [
      "createMany",
      { data: [{ organizationId: "org-a" }, { organizationId: "org-b" }] },
      "scoped.createMany",
    ],
    [
      "createMany",
      {
        data: [
          { organizationId: "org-a" },
          { organizationId: "org-a" },
          { organizationId: "org-b" },
        ],
      },
      "scoped.createMany",
    ],
    [
      "updateMany",
      { where: { organizationId: "org-b" }, data: { name: "n" } },
      "scoped.updateMany",
    ],
    ["deleteMany", { where: { organizationId: "org-b" } }, "scoped.deleteMany"],
    [
      "update",
      {
        where: { id: "x", organizationId: "org-a" },
        data: { organizationId: "org-b" },
      },
      "scoped.update",
    ],
    [
      "create",
      {
        data: {
          organizationId: "org-a",
          items: { create: [{ organizationId: "org-b" }] },
        },
      },
      "scoped.create",
    ],
    [
      "create",
      {
        data: {
          organizationId: "org-a",
          organization: { connect: { id: "org-b" } },
        },
      },
      "scoped.create",
    ],
    [
      "upsert",
      {
        where: { id: "x", organizationId: "org-a" },
        create: { organizationId: "org-b" },
        update: { name: "n" },
      },
      "scoped.upsert",
    ],
    [
      "upsert",
      {
        where: { id: "x", organizationId: "org-b" },
        create: { organizationId: "org-a" },
        update: { name: "n" },
      },
      "scoped.upsert",
    ],
  ])(
    "%s z %j rzuca TenantScopeError i nie wywołuje query",
    async (operation, args, prefix) => {
      const query = vi.fn(async () => "ok");

      const result = runInOrganizationScope("org-a", () =>
        guardFake(operation, args, query),
      );

      await expect(result).rejects.toBeInstanceOf(TenantScopeError);
      await expect(result).rejects.toMatchObject({
        name: "TenantScopeError",
        model: "Scoped",
        operation,
        message: `${prefix} outside job organization`,
      });
      expect(query).not.toHaveBeenCalled();
    },
  );
});

describe("guard w zakresie organizacji zadania na prawdziwych modelach", () => {
  it("AuditLog z org-b rzuca błąd z dokładnym komunikatem, modelem i operacją", async () => {
    const query = vi.fn(async () => []);

    const result = runInOrganizationScope("org-a", () =>
      guardReal(
        "AuditLog",
        "findMany",
        { where: { organizationId: "org-b" } },
        query,
      ),
    );

    await expect(result).rejects.toBeInstanceOf(TenantScopeError);
    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "AuditLog",
      operation: "findMany",
      message: "auditLog.findMany outside job organization",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("AuditLog z org-a przechodzi z niezmienionymi args", async () => {
    const args = { where: { organizationId: "org-a" } };
    const query = vi.fn<(args: unknown) => Promise<unknown>>(async () => [
      { id: "log" },
    ]);

    const result = await runInOrganizationScope("org-a", () =>
      guardReal("AuditLog", "findMany", args, query),
    );

    expect(result).toEqual([{ id: "log" }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(args);
  });

  it.each(["Member", "Invitation"])(
    "%s poza zakresem nadal przechodzi bez filtra organizacji",
    async (model) => {
      const query = vi.fn(async () => []);

      await expect(guardReal(model, "findMany", {}, query)).resolves.toEqual(
        [],
      );
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["Member", "member.findMany outside job organization"],
    ["Invitation", "invitation.findMany outside job organization"],
  ])(
    "%s w zakresie z org-b rzuca błąd organizacji zadania",
    async (model, message) => {
      const query = vi.fn(async () => []);

      const result = runInOrganizationScope("org-a", () =>
        guardReal(
          model,
          "findMany",
          { where: { organizationId: "org-b" } },
          query,
        ),
      );

      await expect(result).rejects.toMatchObject({
        name: "TenantScopeError",
        model,
        operation: "findMany",
        message,
      });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(["Member", "Invitation"])(
    "%s w zakresie bez filtra organizacji jest odrzucany",
    async (model) => {
      const query = vi.fn(async () => []);

      await expect(
        runInOrganizationScope("org-a", () =>
          guardReal(model, "findMany", {}, query),
        ),
      ).rejects.toBeInstanceOf(TenantScopeError);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(["Member", "Invitation"])(
    "%s w zakresie z org-a przechodzi",
    async (model) => {
      const query = vi.fn(async () => [{ id: "row" }]);

      await expect(
        runInOrganizationScope("org-a", () =>
          guardReal(
            model,
            "findMany",
            { where: { organizationId: "org-a" } },
            query,
          ),
        ),
      ).resolves.toEqual([{ id: "row" }]);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it("member.deleteMany z org-b w zakresie nazywa operację w komunikacie", async () => {
    const query = vi.fn(async () => ({ count: 0 }));

    await expect(
      runInOrganizationScope("org-a", () =>
        guardReal(
          "Member",
          "deleteMany",
          { where: { organizationId: "org-b" } },
          query,
        ),
      ),
    ).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "Member",
      operation: "deleteMany",
      message: "member.deleteMany outside job organization",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["User", "Organization"])(
    "%s bez kolumny organizationId przechodzi w zakresie",
    async (model) => {
      const query = vi.fn(async () => [{ id: "row" }]);

      await expect(
        runInOrganizationScope("org-a", () =>
          guardReal(model, "findMany", { where: { id: "x" } }, query),
        ),
      ).resolves.toEqual([{ id: "row" }]);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it("w zakresie model z kolumną organizationId spoza isScoped jest sprawdzany", async () => {
    const query = vi.fn(async () => []);

    const result = runInOrganizationScope("org-a", () =>
      guardTenantQuery(
        {
          model: "Unguarded",
          operation: "findMany",
          args: { where: { organizationId: "org-b" } },
          query,
        },
        () => false,
        (model) => model === "Unguarded",
      ),
    );

    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      message: "unguarded.findMany outside job organization",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("w zakresie model bez kolumny organizationId przechodzi bez filtra", async () => {
    const query = vi.fn(async () => "ok");

    await expect(
      runInOrganizationScope("org-a", () =>
        guardFake("findMany", {}, query, "Plain"),
      ),
    ).resolves.toBe("ok");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("po zamknięciu zakresu org-b znowu przechodzi jak przed zmianą", async () => {
    await runInOrganizationScope("org-a", async () => undefined);
    const query = vi.fn(async () => []);

    await expect(
      guardReal(
        "AuditLog",
        "findMany",
        { where: { organizationId: "org-b" } },
        query,
      ),
    ).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("withoutTenantScope a zakres organizacji zadania", () => {
  it("withoutTenantScope w zakresie odrzuca i nie wywołuje fn", async () => {
    const fn = vi.fn(async () => "x");

    const result = runInOrganizationScope("org-a", () =>
      withoutTenantScope("x", fn),
    );

    await expect(result).rejects.toThrow(
      new Error("withoutTenantScope is not allowed in an organization job"),
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("bypass otwarty przed zakresem nie zwalnia zapytania o org-b w zakresie", async () => {
    const query = vi.fn(async () => []);

    const result = withoutTenantScope("x", () =>
      runInOrganizationScope("org-a", () =>
        guardReal(
          "AuditLog",
          "findMany",
          { where: { organizationId: "org-b" } },
          query,
        ),
      ),
    );

    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      model: "AuditLog",
      operation: "findMany",
      message: "auditLog.findMany outside job organization",
    });
    expect(query).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it("bypass otwarty przed zakresem nie zwalnia zapytania bez filtra w zakresie", async () => {
    const query = vi.fn(async () => []);

    const result = withoutTenantScope("x", () =>
      runInOrganizationScope("org-a", () => guardFake("findMany", {}, query)),
    );

    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      message: "scoped.findMany outside job organization",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("bypass przed zakresem nadal działa poza zakresem", async () => {
    const query = vi.fn(async () => "ok");

    await expect(
      withoutTenantScope("x", () => guardFake("findMany", {}, query)),
    ).resolves.toBe("ok");
    expect(query).toHaveBeenCalledTimes(1);
  });
});

const ORGANIZATION_SCOPE_KEY = Symbol.for("gatojs.organization-scope");
const BYPASS_STORE_KEY = Symbol.for("gatojs.tenant-scope.bypass");

async function loadModuleCopy() {
  vi.resetModules();
  const scope = await import("../organization-scope");
  const extension = await import("../tenant-scope-extension");
  const errors = await import("../tenant-scope");
  return {
    runInOrganizationScope: scope.runInOrganizationScope,
    currentOrganizationScope: scope.currentOrganizationScope,
    guardTenantQuery: extension.guardTenantQuery,
    withoutTenantScope: extension.withoutTenantScope,
    TenantScopeError: errors.TenantScopeError,
  };
}

type ModuleCopy = Awaited<ReturnType<typeof loadModuleCopy>>;

function clearSharedStores() {
  Reflect.deleteProperty(globalThis, ORGANIZATION_SCOPE_KEY);
  Reflect.deleteProperty(globalThis, BYPASS_STORE_KEY);
}

describe("zakres organizacji zadania przy kilku kopiach modułu", () => {
  let copyA: ModuleCopy;
  let copyB: ModuleCopy;

  beforeEach(async () => {
    clearSharedStores();
    copyA = await loadModuleCopy();
    copyB = await loadModuleCopy();
  });

  afterEach(() => {
    clearSharedStores();
    vi.resetModules();
  });

  it("kopie są osobnymi instancjami modułu", () => {
    expect(copyA.runInOrganizationScope).not.toBe(copyB.runInOrganizationScope);
    expect(copyA.guardTenantQuery).not.toBe(copyB.guardTenantQuery);
  });

  it("store zakresu to AsyncLocalStorage pod kluczem gatojs.organization-scope na globalThis", async () => {
    await copyA.runInOrganizationScope("org-a", async () => undefined);

    expect(Reflect.get(globalThis, ORGANIZATION_SCOPE_KEY)).toBeInstanceOf(
      AsyncLocalStorage,
    );
  });

  it("zakres otwarty przez kopię A widzi currentOrganizationScope kopii B", async () => {
    const seen = await copyA.runInOrganizationScope("org-a", async () =>
      copyB.currentOrganizationScope(),
    );

    expect(seen).toBe("org-a");
  });

  it("zakres otwarty przez kopię A sprawdza wartość w guardzie kopii B", async () => {
    const query = vi.fn(async () => []);

    const result = copyA.runInOrganizationScope("org-a", () =>
      copyB.guardTenantQuery(
        {
          model: "Scoped",
          operation: "findMany",
          args: { where: { organizationId: "org-b" } },
          query,
        },
        isScoped,
        hasOrganization,
      ),
    );

    await expect(result).rejects.toBeInstanceOf(copyB.TenantScopeError);
    await expect(result).rejects.toMatchObject({
      name: "TenantScopeError",
      message: "scoped.findMany outside job organization",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("zakres otwarty przez kopię A blokuje withoutTenantScope kopii B", async () => {
    const fn = vi.fn(async () => "x");

    await expect(
      copyA.runInOrganizationScope("org-a", () =>
        copyB.withoutTenantScope("x", fn),
      ),
    ).rejects.toThrow(
      new Error("withoutTenantScope is not allowed in an organization job"),
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("kopia B nie pozwala zmienić organizacji w zakresie otwartym przez kopię A", async () => {
    const inner = vi.fn(async () => "x");

    await expect(
      copyA.runInOrganizationScope("org-a", () =>
        copyB.runInOrganizationScope("org-b", inner),
      ),
    ).rejects.toThrow(
      new Error(
        "runInOrganizationScope cannot switch organization inside an organization job",
      ),
    );
    expect(inner).not.toHaveBeenCalled();
  });
});
