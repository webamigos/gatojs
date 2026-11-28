// @vitest-environment node
import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";
import {
  currentRequestPrincipal,
  runWithRequestPrincipal,
  type RequestPrincipal,
} from "../request-principal";

const PRINCIPAL: RequestPrincipal = {
  channel: "mcp",
  userId: "u1",
  organizationId: "o1",
  accountRole: "user",
  credentialId: "client-1",
  scopes: ["mcp:read"],
  correlationId: "corr-1",
};

const OTHER_PRINCIPAL: RequestPrincipal = {
  channel: "mcp",
  userId: "u2",
  organizationId: "o2",
  accountRole: "admin",
  credentialId: "client-2",
  scopes: ["mcp:read", "mcp:write"],
  correlationId: "corr-2",
};

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("currentRequestPrincipal", () => {
  it("poza runWithRequestPrincipal → null", () => {
    expect(currentRequestPrincipal()).toBeNull();
  });

  it("wewnątrz runWithRequestPrincipal → ten sam obiekt principala", () => {
    const seen = runWithRequestPrincipal(PRINCIPAL, () =>
      currentRequestPrincipal(),
    );

    expect(seen).toBe(PRINCIPAL);
  });

  it("po zakończeniu fn → znowu null", () => {
    runWithRequestPrincipal(PRINCIPAL, () => undefined);

    expect(currentRequestPrincipal()).toBeNull();
  });

  it("principal jest widoczny po await wewnątrz asynchronicznej fn", async () => {
    const seen = await runWithRequestPrincipal(PRINCIPAL, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentRequestPrincipal();
    });

    expect(seen).toBe(PRINCIPAL);
    expect(currentRequestPrincipal()).toBeNull();
  });
});

describe("runWithRequestPrincipal", () => {
  it("zwraca wynik synchronicznej fn bez zmian", () => {
    expect(runWithRequestPrincipal(PRINCIPAL, () => 42)).toBe(42);
  });

  it("zwraca obietnicę asynchronicznej fn z jej wynikiem", async () => {
    const result = runWithRequestPrincipal(PRINCIPAL, async () => "wynik");

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe("wynik");
  });

  it("wyjątek fn jest propagowany, a principal znika", () => {
    expect(() =>
      runWithRequestPrincipal(PRINCIPAL, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(currentRequestPrincipal()).toBeNull();
  });

  it("odrzucona obietnica fn jest propagowana, a principal znika", async () => {
    await expect(
      runWithRequestPrincipal(PRINCIPAL, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(currentRequestPrincipal()).toBeNull();
  });

  it("zagnieżdżony principal jest bieżący wewnątrz, a zewnętrzny wraca po nim", () => {
    const seen = runWithRequestPrincipal(PRINCIPAL, () => {
      const inner = runWithRequestPrincipal(OTHER_PRINCIPAL, () =>
        currentRequestPrincipal(),
      );
      return { inner, outerAfter: currentRequestPrincipal() };
    });

    expect(seen.inner).toBe(OTHER_PRINCIPAL);
    expect(seen.outerAfter).toBe(PRINCIPAL);
    expect(currentRequestPrincipal()).toBeNull();
  });

  it("zagnieżdżony asynchroniczny principal → zewnętrzny wraca po await", async () => {
    const seen = await runWithRequestPrincipal(PRINCIPAL, async () => {
      const inner = await runWithRequestPrincipal(OTHER_PRINCIPAL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return currentRequestPrincipal();
      });
      return { inner, outerAfter: currentRequestPrincipal() };
    });

    expect(seen).toStrictEqual({
      inner: OTHER_PRINCIPAL,
      outerAfter: PRINCIPAL,
    });
  });

  it("principal nie przecieka do równoległego łańcucha poza runWithRequestPrincipal", async () => {
    const gate = deferred();

    const scoped = runWithRequestPrincipal(PRINCIPAL, async () => {
      await gate.promise;
      return currentRequestPrincipal();
    });
    const outside = await Promise.resolve().then(() =>
      currentRequestPrincipal(),
    );
    gate.release();

    expect(outside).toBeNull();
    await expect(scoped).resolves.toBe(PRINCIPAL);
  });

  it("dwa równoległe wywołania widzą każde swój principal", async () => {
    const gate = deferred();

    const first = runWithRequestPrincipal(PRINCIPAL, async () => {
      await gate.promise;
      return currentRequestPrincipal();
    });
    const second = runWithRequestPrincipal(OTHER_PRINCIPAL, async () => {
      await gate.promise;
      return currentRequestPrincipal();
    });
    gate.release();

    await expect(first).resolves.toBe(PRINCIPAL);
    await expect(second).resolves.toBe(OTHER_PRINCIPAL);
  });

  it("magazyn principala to AsyncLocalStorage pod globalnym kluczem gatojs.request-principal", () => {
    runWithRequestPrincipal(PRINCIPAL, () => undefined);

    expect(
      Reflect.get(globalThis, Symbol.for("gatojs.request-principal")),
    ).toBeInstanceOf(AsyncLocalStorage);
  });
});
