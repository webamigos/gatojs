import { vi } from "vitest";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

export interface FakeTables {
  users: Row[];
  organizations: Row[];
  members: Row[];
  sessions: Row[];
}

type TableName = keyof FakeTables;

interface Relation {
  table: TableName;
  kind: "one" | "many";
  localKey: string;
  foreignKey: string;
}

const RELATIONS: Record<TableName, Record<string, Relation>> = {
  users: {
    members: {
      table: "members",
      kind: "many",
      localKey: "id",
      foreignKey: "userId",
    },
    sessions: {
      table: "sessions",
      kind: "many",
      localKey: "id",
      foreignKey: "userId",
    },
  },
  organizations: {
    members: {
      table: "members",
      kind: "many",
      localKey: "id",
      foreignKey: "organizationId",
    },
  },
  members: {
    organization: {
      table: "organizations",
      kind: "one",
      localKey: "organizationId",
      foreignKey: "id",
    },
    user: { table: "users", kind: "one", localKey: "userId", foreignKey: "id" },
  },
  sessions: {
    user: { table: "users", kind: "one", localKey: "userId", foreignKey: "id" },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

function matchesScalar(value: unknown, condition: unknown): boolean {
  if (!isPlainObject(condition)) {
    return sameValue(value, condition);
  }
  return Object.entries(condition).every(([operator, operand]) => {
    if (operator === "equals") {
      return sameValue(value, operand);
    }
    if (operator === "not") {
      return !matchesScalar(value, operand);
    }
    if (operator === "in") {
      return (operand as unknown[]).some((item) => sameValue(value, item));
    }
    if (operator === "notIn") {
      return !(operand as unknown[]).some((item) => sameValue(value, item));
    }
    throw new Error(`fake-prisma: nieobsługiwany operator ${operator}`);
  });
}

export function createFakePrisma(initial: FakeTables) {
  const tables: FakeTables = {
    users: initial.users.map((row) => ({ ...row })),
    organizations: initial.organizations.map((row) => ({ ...row })),
    members: initial.members.map((row) => ({ ...row })),
    sessions: initial.sessions.map((row) => ({ ...row })),
  };

  function related(table: TableName, row: Row, field: string): Row[] {
    const relation = RELATIONS[table][field];
    if (!relation) {
      throw new Error(`fake-prisma: nieznana relacja ${table}.${field}`);
    }
    return tables[relation.table].filter((candidate) =>
      sameValue(candidate[relation.foreignKey], row[relation.localKey]),
    );
  }

  function matches(
    table: TableName,
    row: Row,
    where: Where | undefined,
  ): boolean {
    if (!where) {
      return true;
    }
    return Object.entries(where).every(([key, condition]) => {
      if (condition === undefined) {
        return true;
      }
      if (key === "AND") {
        return (condition as Where[]).every((part) =>
          matches(table, row, part),
        );
      }
      if (key === "OR") {
        return (condition as Where[]).some((part) => matches(table, row, part));
      }
      if (key === "NOT") {
        return !matches(table, row, condition as Where);
      }
      const relation = RELATIONS[table][key];
      if (relation?.kind === "many") {
        const rows = related(table, row, key);
        const filter = condition as {
          some?: Where;
          none?: Where;
          every?: Where;
        };
        if (filter.some) {
          return rows.some((item) =>
            matches(relation.table, item, filter.some),
          );
        }
        if (filter.none) {
          return !rows.some((item) =>
            matches(relation.table, item, filter.none),
          );
        }
        return rows.every((item) =>
          matches(relation.table, item, filter.every),
        );
      }
      if (relation?.kind === "one") {
        const [target] = related(table, row, key);
        const nested =
          isPlainObject(condition) && "is" in condition
            ? (condition.is as Where)
            : (condition as Where);
        return target !== undefined && matches(relation.table, target, nested);
      }
      if (key.includes("_") && isPlainObject(condition) && !(key in row)) {
        return matches(table, row, condition);
      }
      return matchesScalar(row[key], condition);
    });
  }

  function sortRows(table: TableName, rows: Row[], orderBy: unknown): Row[] {
    if (!orderBy) {
      return rows;
    }
    const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
    const valueFor = (
      row: Row,
      order: Record<string, unknown>,
    ): {
      value: unknown;
      direction: string;
    } => {
      const [[key, direction]] = Object.entries(order) as [[string, unknown]];
      if (isPlainObject(direction)) {
        const [target] = related(table, row, key);
        const relation = RELATIONS[table][key];
        if (!relation || !target) {
          return { value: null, direction: "asc" };
        }
        const [[nestedKey, nestedDirection]] = Object.entries(direction);
        return {
          value: target[nestedKey],
          direction: String(nestedDirection),
        };
      }
      return { value: row[key], direction: String(direction) };
    };
    return [...rows].sort((left, right) => {
      for (const order of orders as Record<string, unknown>[]) {
        const a = valueFor(left, order);
        const b = valueFor(right, order);
        const leftValue = a.value instanceof Date ? a.value.getTime() : a.value;
        const rightValue =
          b.value instanceof Date ? b.value.getTime() : b.value;
        if (leftValue === rightValue) {
          continue;
        }
        const ascending =
          (leftValue as string | number) < (rightValue as string | number)
            ? -1
            : 1;
        return a.direction === "desc" ? -ascending : ascending;
      }
      return 0;
    });
  }

  function project(
    table: TableName,
    row: Row,
    args: {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    },
  ): Row {
    const shape = args.select ?? args.include;
    if (!shape) {
      return { ...row };
    }
    const result: Row = args.select ? {} : { ...row };
    for (const [key, spec] of Object.entries(shape)) {
      if (!spec) {
        continue;
      }
      const relation = RELATIONS[table][key];
      if (!relation) {
        result[key] = row[key];
        continue;
      }
      const nestedArgs = isPlainObject(spec) ? spec : {};
      const rows = sortRows(
        relation.table,
        related(table, row, key).filter((item) =>
          matches(relation.table, item, nestedArgs.where as Where | undefined),
        ),
        nestedArgs.orderBy,
      );
      const projected = rows.map((item) =>
        project(relation.table, item, nestedArgs),
      );
      result[key] =
        relation.kind === "many" ? projected : (projected[0] ?? null);
    }
    return result;
  }

  interface FindArgs {
    where?: Where;
    orderBy?: unknown;
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
    take?: number;
    skip?: number;
  }

  function findMany(table: TableName, args: FindArgs = {}): Row[] {
    const filtered = tables[table].filter((row) =>
      matches(table, row, args.where),
    );
    const sorted = sortRows(table, filtered, args.orderBy);
    const sliced = sorted.slice(
      args.skip ?? 0,
      args.take === undefined ? undefined : (args.skip ?? 0) + args.take,
    );
    return sliced.map((row) => project(table, row, args));
  }

  function notFound(table: TableName): Error {
    return Object.assign(new Error(`fake-prisma: brak rekordu w ${table}`), {
      code: "P2025",
    });
  }

  function model(table: TableName) {
    return {
      findMany: vi.fn(async (args?: FindArgs) => findMany(table, args)),
      findFirst: vi.fn(
        async (args?: FindArgs) => findMany(table, args)[0] ?? null,
      ),
      findUnique: vi.fn(
        async (args: FindArgs) => findMany(table, args)[0] ?? null,
      ),
      findFirstOrThrow: vi.fn(async (args?: FindArgs) => {
        const [row] = findMany(table, args);
        if (!row) {
          throw notFound(table);
        }
        return row;
      }),
      findUniqueOrThrow: vi.fn(async (args: FindArgs) => {
        const [row] = findMany(table, args);
        if (!row) {
          throw notFound(table);
        }
        return row;
      }),
      count: vi.fn(
        async (args?: { where?: Where }) =>
          tables[table].filter((row) => matches(table, row, args?.where))
            .length,
      ),
      update: vi.fn(async (args: FindArgs & { data: Row }) => {
        const target = tables[table].find((row) =>
          matches(table, row, args.where),
        );
        if (!target) {
          throw notFound(table);
        }
        Object.assign(target, args.data);
        return project(table, target, args);
      }),
      updateMany: vi.fn(async (args: { where?: Where; data: Row }) => {
        const targets = tables[table].filter((row) =>
          matches(table, row, args.where),
        );
        for (const target of targets) {
          Object.assign(target, args.data);
        }
        return { count: targets.length };
      }),
    };
  }

  const prisma = {
    user: model("users"),
    organization: model("organizations"),
    member: model("members"),
    session: model("sessions"),
    $transaction: vi.fn(async (operations: unknown) => {
      if (typeof operations === "function") {
        return (operations as (client: unknown) => unknown)(prisma);
      }
      return Promise.all(operations as Promise<unknown>[]);
    }),
  };

  return { prisma, tables };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>["prisma"];
