import { Prisma } from "@/generated/prisma/client";

const ORGANIZATION_FIELD = "organizationId";
const UNGUARDED_MODELS: readonly string[] = ["Member", "Invitation"];

const WHERE_OPERATIONS: readonly string[] = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
];

const CREATE_MANY_OPERATIONS: readonly string[] = [
  "createMany",
  "createManyAndReturn",
];

export class TenantScopeError extends Error {
  name = "TenantScopeError";
  readonly model: string;
  readonly operation: string;

  constructor(model: string, operation: string) {
    super(
      `Query ${model}.${operation} has no organizationId filter. Add an organization filter or use withoutTenantScope(reason, …).`,
    );
    this.model = model;
    this.operation = operation;
  }
}

export function findTenantScopedModels(
  scalarFieldsByModel: Record<string, readonly string[]>,
): string[] {
  return Object.entries(scalarFieldsByModel)
    .filter(
      ([model, fields]) =>
        fields.includes(ORGANIZATION_FIELD) &&
        !UNGUARDED_MODELS.includes(model),
    )
    .map(([model]) => model);
}

function readGeneratedScalarFields(): Record<string, readonly string[]> {
  const namespace: Record<string, unknown> = Prisma;
  return Object.fromEntries(
    Object.values(Prisma.ModelName).map((model) => {
      const fieldEnum = namespace[`${model}ScalarFieldEnum`];
      const fields = isRecord(fieldEnum) ? Object.keys(fieldEnum) : [];
      return [model, fields];
    }),
  );
}

const tenantScopedModels = new Set(
  findTenantScopedModels(readGeneratedScalarFields()),
);

export function isTenantScoped(model: string): boolean {
  return tenantScopedModels.has(model);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isPinnedOrganization(value: unknown): boolean {
  if (isNonEmptyString(value)) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (isNonEmptyString(value.equals)) {
    return true;
  }
  const values = value.in;
  return (
    Array.isArray(values) && values.length > 0 && values.every(isNonEmptyString)
  );
}

function isCompoundOrganizationSelector(key: string, value: unknown): boolean {
  return (
    key !== ORGANIZATION_FIELD &&
    key.split("_").includes(ORGANIZATION_FIELD) &&
    isRecord(value) &&
    isPinnedOrganization(value[ORGANIZATION_FIELD])
  );
}

function isScopedWhere(where: unknown): boolean {
  if (!isRecord(where)) {
    return false;
  }
  if (isPinnedOrganization(where[ORGANIZATION_FIELD])) {
    return true;
  }
  if (
    Object.entries(where).some(([key, value]) =>
      isCompoundOrganizationSelector(key, value),
    )
  ) {
    return true;
  }
  const { AND: and, OR: or } = where;
  if (Array.isArray(and) ? and.some(isScopedWhere) : isScopedWhere(and)) {
    return true;
  }
  return Array.isArray(or) && or.length > 0 && or.every(isScopedWhere);
}

function hasOrganization(data: unknown): boolean {
  return isRecord(data) && isNonEmptyString(data[ORGANIZATION_FIELD]);
}

export function isTenantScopeSatisfied(
  operation: string,
  args: unknown,
): boolean {
  if (!isRecord(args)) {
    return false;
  }
  if (WHERE_OPERATIONS.includes(operation)) {
    return isScopedWhere(args.where);
  }
  if (operation === "create") {
    return hasOrganization(args.data);
  }
  if (CREATE_MANY_OPERATIONS.includes(operation)) {
    const { data } = args;
    return Array.isArray(data)
      ? data.every(hasOrganization)
      : hasOrganization(data);
  }
  if (operation === "upsert") {
    return isScopedWhere(args.where) && hasOrganization(args.create);
  }
  return false;
}
