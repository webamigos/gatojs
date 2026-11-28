import { AsyncLocalStorage } from "node:async_hooks";

const ORGANIZATION_SCOPE_KEY = Symbol.for("gatojs.organization-scope");

type GlobalWithScopeStore = typeof globalThis & { [key: symbol]: unknown };

// WHY: the production server bundles this module into several chunks, so every copy must read
// the scope from one store on globalThis, like the tenant-scope bypass store.
function sharedScopeStorage(): AsyncLocalStorage<string> {
  const globalStore = globalThis as GlobalWithScopeStore;
  const existing = globalStore[ORGANIZATION_SCOPE_KEY];
  if (existing instanceof AsyncLocalStorage) {
    return existing as AsyncLocalStorage<string>;
  }
  const created = new AsyncLocalStorage<string>();
  globalStore[ORGANIZATION_SCOPE_KEY] = created;
  return created;
}

export function currentOrganizationScope(): string | undefined {
  return sharedScopeStorage().getStore();
}

export async function runInOrganizationScope<T>(
  organizationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (organizationId.trim() === "") {
    throw new Error("runInOrganizationScope needs an organization id");
  }
  const current = currentOrganizationScope();
  if (current !== undefined && current !== organizationId) {
    throw new Error(
      "runInOrganizationScope cannot switch organization inside an organization job",
    );
  }
  // WHY: Prisma queries are lazy thenables; awaiting inside run() executes them within the scope.
  return sharedScopeStorage().run(organizationId, async () => await fn());
}
