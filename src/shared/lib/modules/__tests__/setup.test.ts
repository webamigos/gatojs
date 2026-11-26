import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardTenantQuery } from "@/shared/lib/tenant-scope/tenant-scope-extension";

type SetupRow = {
  organizationId: string;
  moduleKey: string;
  moduleVersion: string;
  finishedAt: Date;
};

type InFilter = string | { in: string[] } | undefined;

function matches(value: string, filter: InFilter): boolean {
  if (filter === undefined) {
    return true;
  }
  if (typeof filter === "string") {
    return value === filter;
  }
  return filter.in.includes(value);
}

const { db, timeline, mockPrisma, mockLogger, registry } = vi.hoisted(() => {
  const db = {
    rows: [] as SetupRow[],
    organizations: [] as { id: string }[],
  };
  const timeline: string[] = [];
  const mockPrisma = {
    organizationModuleSetup: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findMany: vi.fn(),
    },
  };
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
  const registry = { setups: [] as unknown[] };
  return { db, timeline, mockPrisma, mockLogger, registry };
});

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/modules.generated", () => ({
  get moduleSetups() {
    return registry.setups;
  },
}));

import {
  OrganizationSetupError,
  defineSetup,
  missingOrganizationSetups,
  runMissingOrganizationSetups,
  runOrganizationSetup,
  type ModuleSetupEntry,
} from "../setup";

const FINISHED_AT = new Date("2026-11-26T10:00:00.000Z");

function readRows(args: {
  where: { organizationId?: InFilter; moduleKey?: InFilter };
}): SetupRow[] {
  return db.rows.filter(
    (row) =>
      matches(row.organizationId, args.where.organizationId) &&
      matches(row.moduleKey, args.where.moduleKey),
  );
}

function installFakeDatabase(): void {
  mockPrisma.organizationModuleSetup.findMany.mockImplementation(
    async (args: {
      where: { organizationId?: InFilter; moduleKey?: InFilter };
    }) => {
      timeline.push("rows:read");
      return guardTenantQuery(
        {
          model: "OrganizationModuleSetup",
          operation: "findMany",
          args,
          query: async () => readRows(args),
        },
        () => true,
      );
    },
  );
  mockPrisma.organizationModuleSetup.upsert.mockImplementation(
    async (args: {
      where: {
        organizationId_moduleKey: { organizationId: string; moduleKey: string };
      };
      create: SetupRow;
      update: { moduleVersion: string; finishedAt: Date };
    }) => {
      const { organizationId, moduleKey } = args.where.organizationId_moduleKey;
      timeline.push(`upsert:${organizationId}:${moduleKey}`);
      const existing = db.rows.find(
        (row) =>
          row.organizationId === organizationId && row.moduleKey === moduleKey,
      );
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }
      db.rows.push({ ...args.create });
      return args.create;
    },
  );
  mockPrisma.organization.findMany.mockImplementation(
    async (args: { where: { id?: string } }) =>
      db.organizations.filter(
        (organization) =>
          args.where.id === undefined || organization.id === args.where.id,
      ),
  );
}

function row(organizationId: string, moduleKey: string): SetupRow {
  return {
    organizationId,
    moduleKey,
    moduleVersion: "0.9.0",
    finishedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function recordingHook(name: string) {
  return vi.fn(async (context: { organizationId: string }) => {
    timeline.push(`${name}:${context.organizationId}`);
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

beforeEach(() => {
  db.rows.length = 0;
  db.organizations.length = 0;
  timeline.length = 0;
  registry.setups = [];
  mockPrisma.organizationModuleSetup.findMany.mockReset();
  mockPrisma.organizationModuleSetup.upsert.mockReset();
  mockPrisma.organization.findMany.mockReset();
  mockLogger.error.mockReset();
  installFakeDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FINISHED_AT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("defineSetup", () => {
  it("returns the same setup object it was given", () => {
    const setup = { onOrganizationCreated: () => undefined };
    expect(defineSetup(setup)).toBe(setup);
  });
});

describe("OrganizationSetupError", () => {
  it("is an Error named OrganizationSetupError carrying its message", () => {
    const error = new OrganizationSetupError("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("OrganizationSetupError");
    expect(error.message).toBe("boom");
  });
});

describe("runOrganizationSetup: onOrganizationCreated", () => {
  it("calls the hook once with exactly { organizationId } of the given organization", async () => {
    const onOrganizationCreated = vi.fn();
    await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        { module: "notes", version: "1.2.0", value: { onOrganizationCreated } },
      ],
    });

    expect(onOrganizationCreated).toHaveBeenCalledTimes(1);
    expect(onOrganizationCreated.mock.calls[0]).toStrictEqual([
      { organizationId: "org-a" },
    ]);
  });

  it("records one row (org-a, notes, 1.2.0) and reports notes as ran", async () => {
    const result = await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: recordingHook("notes") },
        },
      ],
    });

    expect(result).toStrictEqual({ ran: ["notes"], skipped: [], failed: [] });
    expect(db.rows).toEqual([
      {
        organizationId: "org-a",
        moduleKey: "notes",
        moduleVersion: "1.2.0",
        finishedAt: FINISHED_AT,
      },
    ]);
  });

  it("writes the row with an upsert on (organizationId, moduleKey) carrying the module version", async () => {
    await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: recordingHook("notes") },
        },
      ],
    });

    expect(mockPrisma.organizationModuleSetup.upsert).toHaveBeenCalledTimes(1);
    expect(
      mockPrisma.organizationModuleSetup.upsert.mock.calls[0][0],
    ).toStrictEqual({
      where: {
        organizationId_moduleKey: {
          organizationId: "org-a",
          moduleKey: "notes",
        },
      },
      create: {
        organizationId: "org-a",
        moduleKey: "notes",
        moduleVersion: "1.2.0",
        finishedAt: FINISHED_AT,
      },
      update: { moduleVersion: "1.2.0", finishedAt: FINISHED_AT },
    });
  });

  it("writes the row only after the hook's promise settled", async () => {
    const gate = deferred();
    const onOrganizationCreated = vi.fn(() => gate.promise);
    const running = runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        { module: "notes", version: "1.2.0", value: { onOrganizationCreated } },
      ],
    });

    await flushAsyncWork();
    expect(onOrganizationCreated).toHaveBeenCalledTimes(1);
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
    expect(db.rows).toEqual([]);

    gate.resolve();
    await expect(running).resolves.toStrictEqual({
      ran: ["notes"],
      skipped: [],
      failed: [],
    });
    expect(mockPrisma.organizationModuleSetup.upsert).toHaveBeenCalledTimes(1);
  });

  it("reads the existing rows of this organization for the modules with the hook, before any hook runs", async () => {
    await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: recordingHook("notes") },
        },
        { module: "demo", version: "1.0.0", value: { seed: vi.fn() } },
        {
          module: "tasks",
          version: "2.0.0",
          value: { onOrganizationCreated: recordingHook("tasks") },
        },
      ],
    });

    expect(
      mockPrisma.organizationModuleSetup.findMany.mock.calls,
    ).toStrictEqual([
      [
        {
          where: {
            organizationId: "org-a",
            moduleKey: { in: ["notes", "tasks"] },
          },
          select: { moduleKey: true },
        },
      ],
    ]);
    expect(timeline[0]).toBe("rows:read");
  });

  it("skips a module that already has a row and does not call its hook", async () => {
    db.rows.push(row("org-a", "notes"));
    const notesHook = recordingHook("notes");
    const tasksHook = recordingHook("tasks");

    const result = await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: notesHook },
        },
        {
          module: "tasks",
          version: "2.0.0",
          value: { onOrganizationCreated: tasksHook },
        },
      ],
    });

    expect(result).toStrictEqual({
      ran: ["tasks"],
      skipped: ["notes"],
      failed: [],
    });
    expect(notesHook).not.toHaveBeenCalled();
    expect(tasksHook).toHaveBeenCalledTimes(1);
    expect(
      mockPrisma.organizationModuleSetup.upsert.mock.calls.map(
        ([args]) => args.where.organizationId_moduleKey,
      ),
    ).toEqual([{ organizationId: "org-a", moduleKey: "tasks" }]);
    expect(db.rows).toContainEqual(row("org-a", "notes"));
  });

  it("a row of another organization does not skip the module for this one", async () => {
    db.rows.push(row("org-b", "notes"));
    const notesHook = recordingHook("notes");

    const result = await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: notesHook },
        },
      ],
    });

    expect(result).toStrictEqual({ ran: ["notes"], skipped: [], failed: [] });
    expect(notesHook.mock.calls).toStrictEqual([[{ organizationId: "org-a" }]]);
  });

  it("a second call for the same organization skips the module and runs its hook no more", async () => {
    const notesHook = recordingHook("notes");
    const modules: ModuleSetupEntry[] = [
      {
        module: "notes",
        version: "1.2.0",
        value: { onOrganizationCreated: notesHook },
      },
    ];

    await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules,
    });
    const second = await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules,
    });

    expect(second).toStrictEqual({ ran: [], skipped: ["notes"], failed: [] });
    expect(notesHook).toHaveBeenCalledTimes(1);
    expect(db.rows).toHaveLength(1);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("notes setup broke");
      },
    ],
    [
      "rejects",
      async () => {
        throw new Error("notes setup broke");
      },
    ],
  ])(
    "a hook that %s is failed, gets no row, is logged, and the next module still runs and gets its row",
    async (_label, failingHook) => {
      const tasksHook = recordingHook("tasks");

      const result = await runOrganizationSetup("org-a", {
        hook: "onOrganizationCreated",
        modules: [
          {
            module: "notes",
            version: "1.2.0",
            value: { onOrganizationCreated: vi.fn(failingHook) },
          },
          {
            module: "tasks",
            version: "2.0.0",
            value: { onOrganizationCreated: tasksHook },
          },
        ],
      });

      expect(result).toStrictEqual({
        ran: ["tasks"],
        skipped: [],
        failed: ["notes"],
      });
      expect(tasksHook).toHaveBeenCalledTimes(1);
      expect(db.rows).toEqual([
        {
          organizationId: "org-a",
          moduleKey: "tasks",
          moduleVersion: "2.0.0",
          finishedAt: FINISHED_AT,
        },
      ]);
      expect(
        mockPrisma.organizationModuleSetup.upsert.mock.calls.map(
          ([args]) => args.where.organizationId_moduleKey.moduleKey,
        ),
      ).toEqual(["tasks"]);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Organization setup failed",
        {
          organizationId: "org-a",
          module: "notes",
          hook: "onOrganizationCreated",
          error: expect.objectContaining({ message: "notes setup broke" }),
        },
      );
    },
  );

  it("logs the very error the hook threw", async () => {
    const boom = new Error("boom");

    await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: {
            onOrganizationCreated: async () => {
              throw boom;
            },
          },
        },
      ],
    });

    expect(mockLogger.error.mock.calls[0][1].error).toBe(boom);
  });

  it("a failing row write makes the module failed and logged, and the next module still runs", async () => {
    const writeError = new Error("db down");
    mockPrisma.organizationModuleSetup.upsert.mockImplementationOnce(
      async () => {
        throw writeError;
      },
    );
    const tasksHook = recordingHook("tasks");

    const result = await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: recordingHook("notes") },
        },
        {
          module: "tasks",
          version: "2.0.0",
          value: { onOrganizationCreated: tasksHook },
        },
      ],
    });

    expect(result).toStrictEqual({
      ran: ["tasks"],
      skipped: [],
      failed: ["notes"],
    });
    expect(tasksHook).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith("Organization setup failed", {
      organizationId: "org-a",
      module: "notes",
      hook: "onOrganizationCreated",
      error: writeError,
    });
  });

  it("resolves when every hook fails", async () => {
    await expect(
      runOrganizationSetup("org-a", {
        hook: "onOrganizationCreated",
        modules: [
          {
            module: "notes",
            version: "1.2.0",
            value: {
              onOrganizationCreated: () => {
                throw new Error("a");
              },
            },
          },
          {
            module: "tasks",
            version: "2.0.0",
            value: {
              onOrganizationCreated: () => Promise.reject(new Error("b")),
            },
          },
        ],
      }),
    ).resolves.toStrictEqual({
      ran: [],
      skipped: [],
      failed: ["notes", "tasks"],
    });
    expect(db.rows).toEqual([]);
  });

  it("ignores entries without the hook: no call, no row, in no list", async () => {
    const seed = vi.fn();

    const result = await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        { module: "demo", version: "1.0.0", value: { seed } },
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: recordingHook("notes") },
        },
      ],
    });

    expect(result).toStrictEqual({ ran: ["notes"], skipped: [], failed: [] });
    expect(seed).not.toHaveBeenCalled();
    expect(db.rows.map((entry) => entry.moduleKey)).toEqual(["notes"]);
  });

  it("runs the modules one at a time in the given order, each row right after its own hook", async () => {
    const first = deferred();
    const zeta = vi.fn(async () => {
      timeline.push("zeta:start");
      await first.promise;
      timeline.push("zeta:end");
    });
    const alpha = vi.fn(async () => {
      timeline.push("alpha:start");
    });
    const running = runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
      modules: [
        {
          module: "zeta",
          version: "1.0.0",
          value: { onOrganizationCreated: zeta },
        },
        {
          module: "alpha",
          version: "1.0.0",
          value: { onOrganizationCreated: alpha },
        },
      ],
    });

    await flushAsyncWork();
    expect(alpha).not.toHaveBeenCalled();
    first.resolve();
    const result = await running;

    expect(result.ran).toEqual(["zeta", "alpha"]);
    expect(timeline).toEqual([
      "rows:read",
      "zeta:start",
      "zeta:end",
      "upsert:org-a:zeta",
      "alpha:start",
      "upsert:org-a:alpha",
    ]);
  });

  it("without modules reads moduleSetups of the registry at call time", async () => {
    const notesHook = recordingHook("notes");
    registry.setups = [
      {
        module: "notes",
        version: "1.2.0",
        value: { onOrganizationCreated: notesHook },
      },
    ];

    const result = await runOrganizationSetup("org-a", {
      hook: "onOrganizationCreated",
    });

    expect(result).toStrictEqual({ ran: ["notes"], skipped: [], failed: [] });
    expect(notesHook.mock.calls).toStrictEqual([[{ organizationId: "org-a" }]]);
    expect(db.rows.map((entry) => entry.moduleVersion)).toEqual(["1.2.0"]);
  });
});

describe("runOrganizationSetup: seed", () => {
  it("runs every seed with exactly { organizationId } and neither reads nor writes rows", async () => {
    const demoSeed = vi.fn();
    const notesSeed = vi.fn(async () => undefined);

    const result = await runOrganizationSetup("org-a", {
      hook: "seed",
      modules: [
        { module: "demo", version: "1.0.0", value: { seed: demoSeed } },
        {
          module: "notes",
          version: "1.2.0",
          value: { seed: notesSeed, onOrganizationCreated: vi.fn() },
        },
      ],
    });

    expect(result).toStrictEqual({
      ran: ["demo", "notes"],
      skipped: [],
      failed: [],
    });
    expect(demoSeed.mock.calls).toStrictEqual([[{ organizationId: "org-a" }]]);
    expect(notesSeed.mock.calls).toStrictEqual([[{ organizationId: "org-a" }]]);
    expect(mockPrisma.organizationModuleSetup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
  });

  it("does not call onOrganizationCreated", async () => {
    const onOrganizationCreated = vi.fn();

    await runOrganizationSetup("org-a", {
      hook: "seed",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { seed: vi.fn(), onOrganizationCreated },
        },
      ],
    });

    expect(onOrganizationCreated).not.toHaveBeenCalled();
  });

  it("runs a seed again on a second call and keeps skipped empty", async () => {
    db.rows.push(row("org-a", "notes"));
    const seed = vi.fn();
    const modules: ModuleSetupEntry[] = [
      { module: "notes", version: "1.2.0", value: { seed } },
    ];

    await runOrganizationSetup("org-a", { hook: "seed", modules });
    const second = await runOrganizationSetup("org-a", {
      hook: "seed",
      modules,
    });

    expect(second).toStrictEqual({ ran: ["notes"], skipped: [], failed: [] });
    expect(seed).toHaveBeenCalledTimes(2);
    expect(db.rows).toEqual([row("org-a", "notes")]);
  });

  it("a failing seed is failed and logged with hook seed, and the next seed still runs", async () => {
    const seedError = new Error("seed broke");
    const tasksSeed = vi.fn();

    const result = await runOrganizationSetup("org-a", {
      hook: "seed",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: {
            seed: async () => {
              throw seedError;
            },
          },
        },
        { module: "tasks", version: "2.0.0", value: { seed: tasksSeed } },
      ],
    });

    expect(result).toStrictEqual({
      ran: ["tasks"],
      skipped: [],
      failed: ["notes"],
    });
    expect(tasksSeed).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith("Organization setup failed", {
      organizationId: "org-a",
      module: "notes",
      hook: "seed",
      error: seedError,
    });
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
  });

  it("ignores entries without seed", async () => {
    const result = await runOrganizationSetup("org-a", {
      hook: "seed",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: { onOrganizationCreated: vi.fn() },
        },
      ],
    });

    expect(result).toStrictEqual({ ran: [], skipped: [], failed: [] });
  });
});

const notesEntry = (onOrganizationCreated = recordingHook("notes")) =>
  ({
    module: "notes",
    version: "1.2.0",
    value: { onOrganizationCreated },
  }) satisfies ModuleSetupEntry;

const tasksEntry = (onOrganizationCreated = recordingHook("tasks")) =>
  ({
    module: "tasks",
    version: "2.0.0",
    value: { onOrganizationCreated },
  }) satisfies ModuleSetupEntry;

const seedOnlyEntry: ModuleSetupEntry = {
  module: "demo",
  version: "1.0.0",
  value: { seed: () => undefined },
};

describe("missingOrganizationSetups", () => {
  beforeEach(() => {
    db.organizations.push({ id: "org-a" }, { id: "org-b" });
  });

  it("lists every organization and module pair without a row, organizations first, then modules in entry order", async () => {
    db.rows.push(row("org-a", "notes"));

    await expect(
      missingOrganizationSetups({
        modules: [notesEntry(), seedOnlyEntry, tasksEntry()],
      }),
    ).resolves.toStrictEqual([
      { organizationId: "org-a", module: "tasks" },
      { organizationId: "org-b", module: "notes" },
      { organizationId: "org-b", module: "tasks" },
    ]);
  });

  it("reads organizations oldest first, then by id, selecting only the id", async () => {
    await missingOrganizationSetups({ modules: [notesEntry()] });

    expect(mockPrisma.organization.findMany.mock.calls).toStrictEqual([
      [
        {
          where: {},
          select: { id: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      ],
    ]);
  });

  it("keeps the order in which the organizations are returned", async () => {
    db.organizations.length = 0;
    db.organizations.push({ id: "org-z" }, { id: "org-a" });

    await expect(
      missingOrganizationSetups({ modules: [notesEntry()] }),
    ).resolves.toStrictEqual([
      { organizationId: "org-z", module: "notes" },
      { organizationId: "org-a", module: "notes" },
    ]);
  });

  it("with module notes lists only notes", async () => {
    await expect(
      missingOrganizationSetups({
        module: "notes",
        modules: [notesEntry(), tasksEntry()],
      }),
    ).resolves.toStrictEqual([
      { organizationId: "org-a", module: "notes" },
      { organizationId: "org-b", module: "notes" },
    ]);
  });

  it("with an organization reads only that organization and lists only its pairs", async () => {
    await expect(
      missingOrganizationSetups({
        organizationId: "org-b",
        modules: [notesEntry()],
      }),
    ).resolves.toStrictEqual([{ organizationId: "org-b", module: "notes" }]);
    expect(
      mockPrisma.organization.findMany.mock.calls[0][0].where,
    ).toStrictEqual({ id: "org-b" });
  });

  it("returns an empty list when every organization has every row", async () => {
    db.rows.push(row("org-a", "notes"), row("org-b", "notes"));

    await expect(
      missingOrganizationSetups({ modules: [notesEntry()] }),
    ).resolves.toStrictEqual([]);
  });

  it("reads the rows of all organizations through the tenant-scope bypass", async () => {
    db.rows.push(row("org-a", "notes"));

    await expect(
      missingOrganizationSetups({ modules: [notesEntry()] }),
    ).resolves.toStrictEqual([{ organizationId: "org-b", module: "notes" }]);
  });

  it("without modules reads moduleSetups of the registry", async () => {
    registry.setups = [notesEntry()];

    await expect(missingOrganizationSetups({})).resolves.toStrictEqual([
      { organizationId: "org-a", module: "notes" },
      { organizationId: "org-b", module: "notes" },
    ]);
  });

  it("an unknown module throws OrganizationSetupError naming it", async () => {
    const error = await missingOrganizationSetups({
      module: "notes",
      modules: [tasksEntry()],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OrganizationSetupError);
    expect((error as Error).name).toBe("OrganizationSetupError");
    expect((error as Error).message).toBe(
      "Module notes has no organization setup or is disabled",
    );
  });

  it("a module with only seed counts as having no organization setup", async () => {
    await expect(
      missingOrganizationSetups({
        module: "demo",
        modules: [seedOnlyEntry, notesEntry()],
      }),
    ).rejects.toThrow(
      new OrganizationSetupError(
        "Module demo has no organization setup or is disabled",
      ),
    );
  });

  it("an unknown organization throws OrganizationSetupError naming it", async () => {
    const error = await missingOrganizationSetups({
      organizationId: "org-x",
      modules: [notesEntry()],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OrganizationSetupError);
    expect((error as Error).message).toBe("Organization org-x not found");
  });

  it("an empty organization id reads only the organization with id empty and throws Organization  not found", async () => {
    const error = await missingOrganizationSetups({
      organizationId: "",
      modules: [notesEntry()],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OrganizationSetupError);
    expect((error as Error).message).toBe("Organization  not found");
    expect(
      mockPrisma.organization.findMany.mock.calls[0][0].where,
    ).toStrictEqual({ id: "" });
  });
});

describe("runMissingOrganizationSetups", () => {
  beforeEach(() => {
    db.organizations.push({ id: "org-a" }, { id: "org-b" });
  });

  it("with module notes runs only for the organization without a row, and a second run runs nothing", async () => {
    db.rows.push(row("org-a", "notes"));
    const notesHook = recordingHook("notes");
    const modules = [notesEntry(notesHook), tasksEntry()];

    const first = await runMissingOrganizationSetups({
      module: "notes",
      modules,
    });
    const second = await runMissingOrganizationSetups({
      module: "notes",
      modules,
    });

    expect(first).toStrictEqual({
      ran: [{ organizationId: "org-b", module: "notes" }],
      failed: [],
    });
    expect(second).toStrictEqual({ ran: [], failed: [] });
    expect(notesHook.mock.calls).toStrictEqual([[{ organizationId: "org-b" }]]);
  });

  it("the module filter keeps other modules from running", async () => {
    const tasksHook = recordingHook("tasks");

    await runMissingOrganizationSetups({
      module: "notes",
      modules: [notesEntry(), tasksEntry(tasksHook)],
    });

    expect(tasksHook).not.toHaveBeenCalled();
    expect(db.rows.map((entry) => entry.moduleKey)).toEqual(["notes", "notes"]);
  });

  it("runs for each organization only its missing modules", async () => {
    db.rows.push(row("org-a", "notes"));
    const notesHook = recordingHook("notes");
    const tasksHook = recordingHook("tasks");

    const result = await runMissingOrganizationSetups({
      modules: [notesEntry(notesHook), tasksEntry(tasksHook)],
    });

    expect(result).toStrictEqual({
      ran: [
        { organizationId: "org-a", module: "tasks" },
        { organizationId: "org-b", module: "notes" },
        { organizationId: "org-b", module: "tasks" },
      ],
      failed: [],
    });
    expect(notesHook.mock.calls).toStrictEqual([[{ organizationId: "org-b" }]]);
    expect(timeline.filter((entry) => !entry.startsWith("rows:"))).toEqual([
      "tasks:org-a",
      "upsert:org-a:tasks",
      "notes:org-b",
      "upsert:org-b:notes",
      "tasks:org-b",
      "upsert:org-b:tasks",
    ]);
  });

  it("a failing hook is reported as failed for its organization and the next organization still runs", async () => {
    db.organizations.push({ id: "org-c" });
    const notesHook = vi.fn(
      async ({ organizationId }: { organizationId: string }) => {
        if (organizationId === "org-b") {
          throw new Error("broke for b");
        }
      },
    );

    const result = await runMissingOrganizationSetups({
      module: "notes",
      modules: [notesEntry(notesHook)],
    });

    expect(result).toStrictEqual({
      ran: [
        { organizationId: "org-a", module: "notes" },
        { organizationId: "org-c", module: "notes" },
      ],
      failed: [{ organizationId: "org-b", module: "notes" }],
    });
    expect(db.rows.map((entry) => entry.organizationId)).toEqual([
      "org-a",
      "org-c",
    ]);
  });

  it("with an organization runs only that organization", async () => {
    const notesHook = recordingHook("notes");

    const result = await runMissingOrganizationSetups({
      organizationId: "org-b",
      modules: [notesEntry(notesHook)],
    });

    expect(result).toStrictEqual({
      ran: [{ organizationId: "org-b", module: "notes" }],
      failed: [],
    });
    expect(notesHook.mock.calls).toStrictEqual([[{ organizationId: "org-b" }]]);
  });

  it("an unknown module rejects with OrganizationSetupError and runs nothing", async () => {
    const tasksHook = recordingHook("tasks");

    await expect(
      runMissingOrganizationSetups({
        module: "notes",
        modules: [tasksEntry(tasksHook)],
      }),
    ).rejects.toThrow(
      new OrganizationSetupError(
        "Module notes has no organization setup or is disabled",
      ),
    );
    expect(tasksHook).not.toHaveBeenCalled();
  });

  it("an unknown organization rejects with OrganizationSetupError and runs nothing", async () => {
    const notesHook = recordingHook("notes");

    await expect(
      runMissingOrganizationSetups({
        organizationId: "org-x",
        modules: [notesEntry(notesHook)],
      }),
    ).rejects.toThrow(
      new OrganizationSetupError("Organization org-x not found"),
    );
    expect(notesHook).not.toHaveBeenCalled();
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
  });

  it("an empty organization id rejects with OrganizationSetupError and runs nothing", async () => {
    const notesHook = recordingHook("notes");

    await expect(
      runMissingOrganizationSetups({
        organizationId: "",
        modules: [notesEntry(notesHook)],
      }),
    ).rejects.toThrow(new OrganizationSetupError("Organization  not found"));
    expect(notesHook).not.toHaveBeenCalled();
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
    expect(db.rows).toEqual([]);
  });
});

describe("runOrganizationSetup: no module has the requested hook", () => {
  const missingTable = () =>
    Promise.reject(
      new Error('relation "organization_module_setups" does not exist'),
    );

  it.each([
    ["an empty module list", [] as ModuleSetupEntry[]],
    ["only a seed-only entry", [seedOnlyEntry]],
  ])(
    "with %s onOrganizationCreated resolves empty and reads no rows",
    async (_label, modules) => {
      await expect(
        runOrganizationSetup("org-a", {
          hook: "onOrganizationCreated",
          modules,
        }),
      ).resolves.toStrictEqual({ ran: [], skipped: [], failed: [] });
      expect(
        mockPrisma.organizationModuleSetup.findMany,
      ).not.toHaveBeenCalled();
      expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["an empty module list", [] as ModuleSetupEntry[]],
    ["only a seed-only entry", [seedOnlyEntry]],
  ])(
    "with %s it still resolves empty and logs nothing when the setup table does not exist yet",
    async (_label, modules) => {
      mockPrisma.organizationModuleSetup.findMany.mockImplementation(
        missingTable,
      );

      await expect(
        runOrganizationSetup("org-a", {
          hook: "onOrganizationCreated",
          modules,
        }),
      ).resolves.toStrictEqual({ ran: [], skipped: [], failed: [] });
      expect(mockLogger.error).not.toHaveBeenCalled();
    },
  );

  it("with an empty registry it resolves empty without reading rows", async () => {
    registry.setups = [];
    mockPrisma.organizationModuleSetup.findMany.mockImplementation(
      missingTable,
    );

    await expect(
      runOrganizationSetup("org-a", { hook: "onOrganizationCreated" }),
    ).resolves.toStrictEqual({ ran: [], skipped: [], failed: [] });
    expect(mockPrisma.organizationModuleSetup.findMany).not.toHaveBeenCalled();
  });
});

describe("missingOrganizationSetups and runMissingOrganizationSetups: no candidate module", () => {
  beforeEach(() => {
    db.organizations.push({ id: "org-a" }, { id: "org-b" });
  });

  it.each([
    ["an empty module list", [] as ModuleSetupEntry[]],
    ["only a seed-only entry", [seedOnlyEntry]],
  ])(
    "with %s and no module filter nothing is missing and no setup row is read",
    async (_label, modules) => {
      await expect(
        missingOrganizationSetups({ modules }),
      ).resolves.toStrictEqual([]);
      expect(
        mockPrisma.organizationModuleSetup.findMany,
      ).not.toHaveBeenCalled();
    },
  );

  it("with an empty module list runMissingOrganizationSetups runs nothing", async () => {
    await expect(
      runMissingOrganizationSetups({ modules: [] }),
    ).resolves.toStrictEqual({ ran: [], failed: [] });
    expect(mockPrisma.organizationModuleSetup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
  });
});
