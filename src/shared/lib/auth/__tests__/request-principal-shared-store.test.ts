// @vitest-environment node
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestPrincipal } from "../request-principal";

const REQUEST_PRINCIPAL_STORE_KEY = Symbol.for("gatojs.request-principal");

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
  accountRole: "superadmin",
  credentialId: "client-2",
  scopes: ["mcp:write"],
  correlationId: "corr-2",
};

async function loadModuleCopy() {
  vi.resetModules();
  const scope = await import("../request-principal");
  return {
    runWithRequestPrincipal: scope.runWithRequestPrincipal,
    currentRequestPrincipal: scope.currentRequestPrincipal,
  };
}

type ModuleCopy = Awaited<ReturnType<typeof loadModuleCopy>>;

function clearSharedStore() {
  Reflect.deleteProperty(globalThis, REQUEST_PRINCIPAL_STORE_KEY);
}

let copyA: ModuleCopy;
let copyB: ModuleCopy;

beforeEach(async () => {
  clearSharedStore();
  copyA = await loadModuleCopy();
  copyB = await loadModuleCopy();
});

afterEach(() => {
  clearSharedStore();
  vi.resetModules();
});

describe("runWithRequestPrincipal przy kilku kopiach modułu w jednym procesie", () => {
  it("kopie są osobnymi instancjami modułu", () => {
    expect(copyA.runWithRequestPrincipal).not.toBe(
      copyB.runWithRequestPrincipal,
    );
    expect(copyA.currentRequestPrincipal).not.toBe(
      copyB.currentRequestPrincipal,
    );
  });

  it("kopia B widzi principal ustawiony przez kopię A", () => {
    const seen = copyA.runWithRequestPrincipal(PRINCIPAL, () =>
      copyB.currentRequestPrincipal(),
    );

    expect(seen).toBe(PRINCIPAL);
  });

  it("kopia A widzi principal ustawiony przez kopię B, także po await", async () => {
    const seen = await copyB.runWithRequestPrincipal(PRINCIPAL, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return copyA.currentRequestPrincipal();
    });

    expect(seen).toBe(PRINCIPAL);
  });

  it("zagnieżdżenie przez dwie kopie → wewnętrzny bieżący, zewnętrzny wraca", () => {
    const seen = copyA.runWithRequestPrincipal(PRINCIPAL, () => {
      const inner = copyB.runWithRequestPrincipal(OTHER_PRINCIPAL, () =>
        copyA.currentRequestPrincipal(),
      );
      return { inner, outerAfter: copyB.currentRequestPrincipal() };
    });

    expect(seen.inner).toBe(OTHER_PRINCIPAL);
    expect(seen.outerAfter).toBe(PRINCIPAL);
  });

  it("po zakończeniu fn kopii A kopia B widzi null", () => {
    copyA.runWithRequestPrincipal(PRINCIPAL, () => undefined);

    expect(copyB.currentRequestPrincipal()).toBeNull();
  });

  it("obie kopie rejestrują jeden magazyn pod globalnym kluczem", () => {
    copyA.runWithRequestPrincipal(PRINCIPAL, () => undefined);
    const registered = Reflect.get(globalThis, REQUEST_PRINCIPAL_STORE_KEY);
    copyB.runWithRequestPrincipal(PRINCIPAL, () => undefined);

    expect(registered).toBeInstanceOf(AsyncLocalStorage);
    expect(Reflect.get(globalThis, REQUEST_PRINCIPAL_STORE_KEY)).toBe(
      registered,
    );
  });

  it("kopia używa magazynu już zarejestrowanego pod globalnym kluczem", async () => {
    clearSharedStore();
    const injected = new AsyncLocalStorage<RequestPrincipal>();
    Reflect.set(globalThis, REQUEST_PRINCIPAL_STORE_KEY, injected);
    const copy = await loadModuleCopy();

    const seenByCopy = injected.run(PRINCIPAL, () =>
      copy.currentRequestPrincipal(),
    );
    const seenByInjected = copy.runWithRequestPrincipal(OTHER_PRINCIPAL, () =>
      injected.getStore(),
    );

    expect(seenByCopy).toBe(PRINCIPAL);
    expect(seenByInjected).toBe(OTHER_PRINCIPAL);
    expect(Reflect.get(globalThis, REQUEST_PRINCIPAL_STORE_KEY)).toBe(injected);
  });
});
