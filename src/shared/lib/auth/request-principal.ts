import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "./roles";

export interface RequestPrincipal {
  channel: "mcp";
  userId: string;
  organizationId: string;
  accountRole: UserRole;
  credentialId: string;
  scopes: readonly string[];
  correlationId: string;
}

const REQUEST_PRINCIPAL_STORE_KEY = Symbol.for("gatojs.request-principal");

type GlobalWithRequestPrincipalStore = typeof globalThis & {
  [key: symbol]: unknown;
};

// WHY: the production server bundles this module into several chunks (the MCP route and the auth helpers),
// so every copy must share one store or the helpers would not see the principal set by the route.
function sharedRequestPrincipalStorage(): AsyncLocalStorage<RequestPrincipal> {
  const globalStore = globalThis as GlobalWithRequestPrincipalStore;
  const existing = globalStore[REQUEST_PRINCIPAL_STORE_KEY];
  if (existing instanceof AsyncLocalStorage) {
    return existing as AsyncLocalStorage<RequestPrincipal>;
  }
  const created = new AsyncLocalStorage<RequestPrincipal>();
  globalStore[REQUEST_PRINCIPAL_STORE_KEY] = created;
  return created;
}

const requestPrincipalStorage = sharedRequestPrincipalStorage();

export function runWithRequestPrincipal<T>(
  principal: RequestPrincipal,
  fn: () => T,
): T {
  return requestPrincipalStorage.run(principal, fn);
}

export function currentRequestPrincipal(): RequestPrincipal | null {
  return requestPrincipalStorage.getStore() ?? null;
}
