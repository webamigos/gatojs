import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/shared/lib/logger";
import { currentOrganizationScope } from "./organization-scope";
import {
  TenantScopeError,
  hasOrganizationColumn,
  isTenantScopeSatisfied,
  isTenantScoped,
  isWithinOrganization,
} from "./tenant-scope";

interface TenantScopeBypass {
  reason: string;
}

const BYPASS_STORE_KEY = Symbol.for("gatojs.tenant-scope.bypass");

type GlobalWithBypassStore = typeof globalThis & { [key: symbol]: unknown };

// WHY: the production server bundles this module into several chunks, and the Prisma client on
// globalThis runs the guard of the copy that created it, so every copy must share one bypass store.
function sharedBypassStorage(): AsyncLocalStorage<TenantScopeBypass> {
  const globalStore = globalThis as GlobalWithBypassStore;
  const existing = globalStore[BYPASS_STORE_KEY];
  if (existing instanceof AsyncLocalStorage) {
    return existing as AsyncLocalStorage<TenantScopeBypass>;
  }
  const created = new AsyncLocalStorage<TenantScopeBypass>();
  globalStore[BYPASS_STORE_KEY] = created;
  return created;
}

const bypassStorage = sharedBypassStorage();

export async function withoutTenantScope<T>(
  reason: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (reason.trim() === "") {
    throw new Error("withoutTenantScope wymaga niepustego powodu");
  }
  if (currentOrganizationScope() !== undefined) {
    throw new Error("withoutTenantScope is not allowed in an organization job");
  }
  // WHY: Prisma queries are lazy thenables; awaiting inside run() executes them within the bypass context.
  return bypassStorage.run({ reason }, async () => await fn());
}

interface TenantQueryParams<T> {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<T>;
}

function guardOrganizationJobQuery<T>(
  { model, operation, args, query }: TenantQueryParams<T>,
  organizationId: string,
  hasOrganization: (model: string) => boolean,
): Promise<T> {
  if (
    hasOrganization(model) &&
    !isWithinOrganization(operation, args, organizationId)
  ) {
    throw new TenantScopeError(model, operation, "outside-job-organization");
  }
  return query(args);
}

export async function guardTenantQuery<T>(
  params: TenantQueryParams<T>,
  isScoped: (model: string) => boolean = isTenantScoped,
  hasOrganization: (model: string) => boolean = hasOrganizationColumn,
): Promise<T> {
  const organizationId = currentOrganizationScope();
  if (organizationId !== undefined) {
    return guardOrganizationJobQuery(params, organizationId, hasOrganization);
  }
  const { model, operation, args, query } = params;
  if (!isScoped(model) || isTenantScopeSatisfied(operation, args)) {
    return query(args);
  }
  const bypass = bypassStorage.getStore();
  if (bypass === undefined) {
    throw new TenantScopeError(model, operation);
  }
  logger.debug("Query without organization filter inside withoutTenantScope", {
    model,
    operation,
    reason: bypass.reason,
  });
  return query(args);
}

export const tenantScopeExtension = Prisma.defineExtension({
  name: "tenant-scope",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        return guardTenantQuery({
          model,
          operation,
          args,
          query: (nextArgs) => query(nextArgs as typeof args),
        });
      },
    },
  },
});
