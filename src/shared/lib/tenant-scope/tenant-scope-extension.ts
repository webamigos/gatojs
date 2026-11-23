import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/shared/lib/logger";
import {
  TenantScopeError,
  isTenantScopeSatisfied,
  isTenantScoped,
} from "./tenant-scope";

interface TenantScopeBypass {
  reason: string;
}

const bypassStorage = new AsyncLocalStorage<TenantScopeBypass>();

export async function withoutTenantScope<T>(
  reason: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (reason.trim() === "") {
    throw new Error("withoutTenantScope wymaga niepustego powodu");
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

export async function guardTenantQuery<T>(
  { model, operation, args, query }: TenantQueryParams<T>,
  isScoped: (model: string) => boolean = isTenantScoped,
): Promise<T> {
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
