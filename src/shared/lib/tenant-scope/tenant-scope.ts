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

export type TenantScopeViolation =
  "missing-organization-filter" | "outside-job-organization";

function lowercaseFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function violationMessage(
  model: string,
  operation: string,
  violation: TenantScopeViolation,
): string {
  if (violation === "outside-job-organization") {
    return `${lowercaseFirst(model)}.${operation} outside job organization`;
  }
  return `Query ${model}.${operation} has no organizationId filter. Add an organization filter or use withoutTenantScope(reason, …).`;
}

export class TenantScopeError extends Error {
  name = "TenantScopeError";
  readonly model: string;
  readonly operation: string;

  constructor(
    model: string,
    operation: string,
    violation: TenantScopeViolation = "missing-organization-filter",
  ) {
    super(violationMessage(model, operation, violation));
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

const modelsWithOrganizationColumn = new Set(
  Object.entries(readGeneratedScalarFields())
    .filter(([, fields]) => fields.includes(ORGANIZATION_FIELD))
    .map(([model]) => model),
);

export function hasOrganizationColumn(model: string): boolean {
  return modelsWithOrganizationColumn.has(model);
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

const ORGANIZATION_RELATION = "organization";

function isPinnedFilterTo(value: unknown, organizationId: string): boolean {
  if (typeof value === "string") {
    return value === organizationId;
  }
  if (!isRecord(value)) {
    return false;
  }
  if ("equals" in value) {
    return value.equals === organizationId;
  }
  const values = value.in;
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every((entry) => entry === organizationId)
  );
}

function isCompoundSelectorPinnedTo(
  key: string,
  value: unknown,
  organizationId: string,
): boolean {
  return (
    key !== ORGANIZATION_FIELD &&
    key.split("_").includes(ORGANIZATION_FIELD) &&
    isRecord(value) &&
    isPinnedFilterTo(value[ORGANIZATION_FIELD], organizationId)
  );
}

function isWherePinnedTo(where: unknown, organizationId: string): boolean {
  if (!isRecord(where)) {
    return false;
  }
  if (isPinnedFilterTo(where[ORGANIZATION_FIELD], organizationId)) {
    return true;
  }
  if (
    Object.entries(where).some(([key, value]) =>
      isCompoundSelectorPinnedTo(key, value, organizationId),
    )
  ) {
    return true;
  }
  const pinned = (part: unknown) => isWherePinnedTo(part, organizationId);
  const { AND: and, OR: or } = where;
  if (Array.isArray(and) ? and.some(pinned) : pinned(and)) {
    return true;
  }
  return Array.isArray(or) && or.length > 0 && or.every(pinned);
}

function isOrganizationValueWithin(
  value: unknown,
  organizationId: string,
): boolean {
  if (isRecord(value) && "set" in value) {
    return value.set === organizationId;
  }
  return isPinnedFilterTo(value, organizationId);
}

function isOrganizationRelationWithin(
  value: unknown,
  organizationId: string,
): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    isRecord(value.connect) &&
    value.connect.id === organizationId
  );
}

function isPayloadWithin(payload: unknown, organizationId: string): boolean {
  if (Array.isArray(payload)) {
    return payload.every((entry) => isPayloadWithin(entry, organizationId));
  }
  if (!isRecord(payload)) {
    return true;
  }
  return Object.entries(payload).every(([key, value]) => {
    if (key === ORGANIZATION_FIELD) {
      return isOrganizationValueWithin(value, organizationId);
    }
    if (key === ORGANIZATION_RELATION) {
      return isOrganizationRelationWithin(value, organizationId);
    }
    return isPayloadWithin(value, organizationId);
  });
}

function isCreatedWithin(data: unknown, organizationId: string): boolean {
  return (
    isRecord(data) &&
    data[ORGANIZATION_FIELD] === organizationId &&
    isPayloadWithin(data, organizationId)
  );
}

function isCreateManyWithin(data: unknown, organizationId: string): boolean {
  const rows = Array.isArray(data) ? data : [data];
  return rows.every((row) => isCreatedWithin(row, organizationId));
}

function isUpsertWithin(
  args: Record<string, unknown>,
  organizationId: string,
): boolean {
  return (
    isWherePinnedTo(args.where, organizationId) &&
    isCreatedWithin(args.create, organizationId) &&
    isPayloadWithin(args.update, organizationId)
  );
}

export function isWithinOrganization(
  operation: string,
  args: unknown,
  organizationId: string,
): boolean {
  if (!isRecord(args)) {
    return false;
  }
  if (WHERE_OPERATIONS.includes(operation)) {
    return (
      isWherePinnedTo(args.where, organizationId) &&
      isPayloadWithin(args.data, organizationId)
    );
  }
  if (operation === "create") {
    return isCreatedWithin(args.data, organizationId);
  }
  if (CREATE_MANY_OPERATIONS.includes(operation)) {
    return isCreateManyWithin(args.data, organizationId);
  }
  if (operation === "upsert") {
    return isUpsertWithin(args, organizationId);
  }
  return false;
}
