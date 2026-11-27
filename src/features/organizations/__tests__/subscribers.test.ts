import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockLogger, registry, hookCalls } = vi.hoisted(() => ({
  mockPrisma: {
    organizationModuleSetup: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    organization: { findMany: vi.fn() },
  },
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  registry: { setups: [] as unknown[] },
  hookCalls: [] as string[],
}));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/modules.generated", () => ({
  moduleEvents: [],
  moduleSubscribers: [],
  get moduleSetups() {
    return registry.setups;
  },
}));

import { coreEvents } from "@/shared/lib/events/core-events";
import { createEventBus } from "@/shared/lib/events/event-bus";
import { subscribers } from "../subscribers";

interface Subscriber {
  id: string;
  run: (event: unknown) => Promise<void> | void;
}

function createdEvent(organizationId: string) {
  return Object.freeze({
    name: "organizations.created",
    organizationId,
    actorUserId: "user-owner",
    serviceMode: false,
    payload: Object.freeze({
      name: "Acme",
      slug: "acme",
      ownerUserId: "user-owner",
    }),
  });
}

function onlyCreatedSubscriber(): Subscriber {
  const entry = (subscribers as Record<string, unknown>)[
    "organizations.created"
  ];
  expect(Array.isArray(entry)).toBe(false);
  return entry as Subscriber;
}

beforeEach(() => {
  hookCalls.length = 0;
  mockPrisma.organizationModuleSetup.findMany.mockReset();
  mockPrisma.organizationModuleSetup.findMany.mockResolvedValue([]);
  mockPrisma.organizationModuleSetup.upsert.mockReset();
  mockPrisma.organizationModuleSetup.upsert.mockResolvedValue({});
  mockLogger.error.mockReset();
  registry.setups = [
    {
      module: "notes",
      version: "1.2.0",
      value: {
        onOrganizationCreated: (context: { organizationId: string }) => {
          hookCalls.push(`notes:created:${context.organizationId}`);
        },
        seed: (context: { organizationId: string }) => {
          hookCalls.push(`notes:seed:${context.organizationId}`);
        },
      },
    },
  ];
});

describe("organizations subscribers", () => {
  it("subscribe only to organizations.created", () => {
    expect(Object.keys(subscribers)).toEqual(["organizations.created"]);
  });

  it("the organizations.created subscriber has the id organizations.module-setup", () => {
    expect(onlyCreatedSubscriber().id).toBe("organizations.module-setup");
  });

  it("running it for org-a runs the onOrganizationCreated hooks for org-a only, not the seeds", async () => {
    await onlyCreatedSubscriber().run(createdEvent("org-a"));

    expect(hookCalls).toEqual(["notes:created:org-a"]);
  });

  it("running it for org-a reads and writes setup rows of org-a only", async () => {
    await onlyCreatedSubscriber().run(createdEvent("org-a"));

    expect(
      mockPrisma.organizationModuleSetup.findMany.mock.calls.map(
        ([args]) => args.where.organizationId,
      ),
    ).toEqual(["org-a"]);
    expect(
      mockPrisma.organizationModuleSetup.upsert.mock.calls.map(
        ([args]) => args.where.organizationId_moduleKey,
      ),
    ).toEqual([{ organizationId: "org-a", moduleKey: "notes" }]);
    expect(
      mockPrisma.organizationModuleSetup.upsert.mock.calls[0][0].create,
    ).toMatchObject({
      organizationId: "org-a",
      moduleKey: "notes",
      moduleVersion: "1.2.0",
    });
  });

  it("an organization that already has the row is not set up again", async () => {
    mockPrisma.organizationModuleSetup.findMany.mockResolvedValue([
      { moduleKey: "notes" },
    ]);

    await onlyCreatedSubscriber().run(createdEvent("org-a"));

    expect(hookCalls).toEqual([]);
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
  });

  it("a failing setup hook does not make the subscriber fail", async () => {
    registry.setups = [
      {
        module: "notes",
        version: "1.2.0",
        value: {
          onOrganizationCreated: () => {
            throw new Error("notes setup broke");
          },
        },
      },
    ];

    const outcome = await Promise.resolve(
      onlyCreatedSubscriber().run(createdEvent("org-a")),
    ).then(
      () => "resolved",
      () => "rejected",
    );

    expect(outcome).toBe("resolved");
    expect(mockPrisma.organizationModuleSetup.upsert).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Organization setup failed",
      expect.objectContaining({ organizationId: "org-a", module: "notes" }),
    );
  });

  it("registers in an event bus under the organizations module and runs setup on organizations.created", async () => {
    const bus = createEventBus({
      core: coreEvents,
      events: [],
      subscribers: [{ module: "organizations", value: subscribers }],
    });

    await bus.emit(
      { organizationId: "org-b", actorUserId: "user-owner" },
      "organizations.created",
      { name: "Beta", slug: "beta", ownerUserId: "user-owner" },
    );

    expect(hookCalls).toEqual(["notes:created:org-b"]);
  });
});
