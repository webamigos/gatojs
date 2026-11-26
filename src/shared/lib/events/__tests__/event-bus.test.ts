import { beforeEach, describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

import { coreEvents } from "../core-events";
import {
  defineEvents,
  EventError,
  type DomainEvent,
  type EventMap,
} from "../define-events";
import { createEventBus, type EventBus } from "../event-bus";

const ORIGIN = { organizationId: "org-a", actorUserId: "u1" };
const INVITED_PAYLOAD = {
  invitationId: "i1",
  email: "a@b.c",
  role: "member",
};
const INVITED_EVENT = {
  name: "users.invited",
  organizationId: "org-a",
  actorUserId: "u1",
  serviceMode: false,
  payload: { invitationId: "i1", email: "a@b.c", role: "member" },
};

type Run = (event: DomainEvent) => Promise<void> | void;

function subscriber(id: string, run: Run) {
  return { id, run };
}

function recorder(log: string[], id: string) {
  return subscriber(id, () => {
    log.push(id);
  });
}

function busWith(
  subscribers: { module: string; value: Record<string, unknown> }[],
  events: { module: string; value: Record<string, z.ZodObject> }[] = [],
) {
  return createEventBus({
    core: coreEvents,
    events,
    subscribers: subscribers as Parameters<
      typeof createEventBus
    >[0]["subscribers"],
  });
}

function constructionError(build: () => unknown): Error {
  try {
    build();
  } catch (error) {
    return error as Error;
  }
  throw new Error("createEventBus did not throw");
}

beforeEach(() => {
  mockLogger.error.mockReset();
});

describe("createEventBus: delivery", () => {
  it("every subscriber of users.invited receives the event with the origin and the payload", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.a", (event) => {
              received.push(event);
            }),
            subscriber("probe.b", (event) => {
              received.push(event);
            }),
          ],
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(received).toEqual([INVITED_EVENT, INVITED_EVENT]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("a single subscriber object (not an array) is delivered too", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": subscriber("probe.only", (event) => {
            received.push(event);
          }),
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(received).toEqual([INVITED_EVENT]);
  });

  it("a subscriber of another event does not run", async () => {
    const log: string[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": recorder(log, "probe.invited"),
          "auth.signed-up": recorder(log, "probe.signed-up"),
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(log).toEqual(["probe.invited"]);
  });

  it("an actor of null reaches the subscriber as null", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "auth.signed-up": subscriber("probe.a", (event) => {
            received.push(event);
          }),
        },
      },
    ]);

    await bus.emit(
      { organizationId: "org-z", actorUserId: null },
      "auth.signed-up",
      { userId: "u9", email: "x@y.z" },
    );

    expect(received).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-z",
        actorUserId: null,
        serviceMode: false,
        payload: { userId: "u9", email: "x@y.z" },
      },
    ]);
  });

  it("an event with no subscriber resolves without logging", async () => {
    const bus = busWith([]);

    await expect(
      bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD),
    ).resolves.toBeUndefined();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("two emits deliver two events, in emit order", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": subscriber("probe.a", (event) => {
            received.push(event);
          }),
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);
    await bus.emit(ORIGIN, "users.invited", {
      invitationId: "i2",
      email: "d@e.f",
      role: "admin",
    });

    expect(received.map((event) => event.payload)).toEqual([
      { invitationId: "i1", email: "a@b.c", role: "member" },
      { invitationId: "i2", email: "d@e.f", role: "admin" },
    ]);
  });

  it("a module event declared in events reaches a subscriber of that module", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith(
      [
        {
          module: "invoices",
          value: {
            "invoices.issued": subscriber("invoices.notify", (event) => {
              received.push(event);
            }),
          },
        },
      ],
      [
        {
          module: "invoices",
          value: defineEvents({
            "invoices.issued": z.object({ invoiceId: z.string() }),
          }),
        },
      ],
    );

    await bus.emit(ORIGIN, "invoices.issued", { invoiceId: "inv-7" });

    expect(received).toEqual([
      {
        name: "invoices.issued",
        organizationId: "org-a",
        actorUserId: "u1",
        serviceMode: false,
        payload: { invoiceId: "inv-7" },
      },
    ]);
  });
});

describe("createEventBus: a failing subscriber", () => {
  it("a throwing first subscriber is logged once and the second still runs, emit resolves", async () => {
    const log: string[] = [];
    const boom = new Error("boom");
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.a", () => {
              log.push("probe.a");
              throw boom;
            }),
            recorder(log, "probe.b"),
          ],
        },
      },
    ]);

    await expect(
      bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD),
    ).resolves.toBeUndefined();

    expect(log).toEqual(["probe.a", "probe.b"]);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith("Event subscriber failed", {
      event: "users.invited",
      subscriber: "probe.a",
      error: boom,
    });
  });

  it("a rejected promise is logged with the event and subscriber id and the next one runs", async () => {
    const log: string[] = [];
    const rejection = new Error("rejected");
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.a", async () => {
              log.push("probe.a");
              throw rejection;
            }),
            recorder(log, "probe.b"),
          ],
        },
      },
    ]);

    await expect(
      bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD),
    ).resolves.toBeUndefined();

    expect(log).toEqual(["probe.a", "probe.b"]);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith("Event subscriber failed", {
      event: "users.invited",
      subscriber: "probe.a",
      error: rejection,
    });
  });

  it("two failing subscribers are logged once each, in run order", async () => {
    const first = new Error("first");
    const second = new Error("second");
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.b", () => {
              throw second;
            }),
            subscriber("probe.a", () => {
              throw first;
            }),
          ],
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(mockLogger.error.mock.calls).toEqual([
      [
        "Event subscriber failed",
        { event: "users.invited", subscriber: "probe.a", error: first },
      ],
      [
        "Event subscriber failed",
        { event: "users.invited", subscriber: "probe.b", error: second },
      ],
    ]);
  });
});

describe("createEventBus: emit rejects bugs in the emitter", () => {
  it("an unknown event name rejects with EventError unknown event: users.nope", async () => {
    const bus = busWith([]);

    const error = await bus.emit(ORIGIN, "users.nope", {}).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "EventError",
      message: "unknown event: users.nope",
    });
  });

  it("a payload with a role outside the schema rejects before any subscriber runs", async () => {
    const log: string[] = [];
    const bus = busWith([
      { module: "probe", value: { "users.invited": recorder(log, "probe.a") } },
    ]);

    const error = await bus
      .emit(ORIGIN, "users.invited", { ...INVITED_PAYLOAD, role: "boss" })
      .then(
        () => null,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("EventError");
    expect(
      (error as Error).message.startsWith("invalid payload for users.invited"),
    ).toBe(true);
    expect(log).toEqual([]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("an invalid payload rejects with exactly invalid payload for users.invited and the ZodError as cause", async () => {
    const bus = busWith([]);

    const error = await bus
      .emit(ORIGIN, "users.invited", { ...INVITED_PAYLOAD, role: "boss" })
      .then(
        () => null,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("invalid payload for users.invited");
    expect((error as Error).name).toBe("EventError");
    const cause = (error as Error).cause;
    expect(cause).toBeInstanceOf(ZodError);
    expect((cause as ZodError).issues.map((issue) => issue.path)).toEqual([
      ["role"],
    ]);
  });

  it("a payload missing a field rejects before any subscriber runs", async () => {
    const log: string[] = [];
    const bus = busWith([
      { module: "probe", value: { "users.invited": recorder(log, "probe.a") } },
    ]);

    await expect(
      bus.emit(ORIGIN, "users.invited", { invitationId: "i1", role: "member" }),
    ).rejects.toThrow("invalid payload for users.invited");
    expect(log).toEqual([]);
  });

  it("a payload that is not an object rejects with EventError, not a TypeError", async () => {
    const bus = busWith([]);

    const error = await bus.emit(ORIGIN, "users.invited", null).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toMatchObject({ name: "EventError" });
    expect(
      (error as Error).message.startsWith("invalid payload for users.invited"),
    ).toBe(true);
  });

  it("subscribers receive the parsed payload, not the raw one", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith(
      [
        {
          module: "billing",
          value: {
            "billing.paid": subscriber("billing.a", (event) => {
              received.push(event);
            }),
          },
        },
      ],
      [
        {
          module: "billing",
          value: defineEvents({
            "billing.paid": z.object({ email: z.string().trim() }),
          }),
        },
      ],
    );

    await bus.emit(ORIGIN, "billing.paid", { email: "  a@b.c  ", extra: 1 });

    expect(received).toHaveLength(1);
    expect(received[0].payload).toStrictEqual({ email: "a@b.c" });
  });
});

describe("createEventBus: order", () => {
  it("subscribers of modules zeta then alpha run in registry order, zeta first", async () => {
    const log: string[] = [];
    const bus = busWith([
      { module: "zeta", value: { "users.invited": recorder(log, "zeta.x") } },
      {
        module: "alpha",
        value: { "users.invited": recorder(log, "alpha.x") },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(log).toEqual(["zeta.x", "alpha.x"]);
  });

  it("the reverse registry order runs alpha first", async () => {
    const log: string[] = [];
    const bus = busWith([
      {
        module: "alpha",
        value: { "users.invited": recorder(log, "alpha.x") },
      },
      { module: "zeta", value: { "users.invited": recorder(log, "zeta.x") } },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(log).toEqual(["alpha.x", "zeta.x"]);
  });

  it("within one module ids m.b, m.a run m.a first", async () => {
    const log: string[] = [];
    const bus = busWith([
      {
        module: "m",
        value: {
          "users.invited": [recorder(log, "m.b"), recorder(log, "m.a")],
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(log).toEqual(["m.a", "m.b"]);
  });

  it("ids are sorted by code point, so an upper-case letter comes before a lower-case one", async () => {
    const log: string[] = [];
    const bus = busWith([
      {
        module: "m",
        value: {
          "users.invited": [recorder(log, "m.a"), recorder(log, "m.B")],
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(log).toEqual(["m.B", "m.a"]);
  });

  it("the id sort stays inside an entry: a later module with a smaller id still runs later", async () => {
    const log: string[] = [];
    const bus = busWith([
      {
        module: "zeta",
        value: {
          "users.invited": [recorder(log, "zeta.b"), recorder(log, "zeta.a")],
        },
      },
      {
        module: "alpha",
        value: { "users.invited": recorder(log, "alpha.a") },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(log).toEqual(["zeta.a", "zeta.b", "alpha.a"]);
  });

  it("the second subscriber starts only after the first one's promise settled", async () => {
    const log: string[] = [];
    let release: () => void = () => undefined;
    const firstDone = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.a", async () => {
              log.push("probe.a:start");
              await firstDone;
              log.push("probe.a:end");
            }),
            recorder(log, "probe.b"),
          ],
        },
      },
    ]);
    let settled = false;

    const emitted = bus
      .emit(ORIGIN, "users.invited", INVITED_PAYLOAD)
      .then(() => {
        settled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(log).toEqual(["probe.a:start"]);
    expect(settled).toBe(false);

    release();
    await emitted;

    expect(log).toEqual(["probe.a:start", "probe.a:end", "probe.b"]);
    expect(settled).toBe(true);
  });

  it("emit resolves only after the last subscriber's promise settled", async () => {
    const log: string[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": subscriber("probe.a", async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            log.push("probe.a:end");
          }),
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(log).toEqual(["probe.a:end"]);
  });
});

describe("createEventBus: the event cannot be changed or spoofed", () => {
  it("the event and its payload are frozen", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": subscriber("probe.a", (event) => {
            received.push(event);
          }),
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(Object.isFrozen(received[0])).toBe(true);
    expect(Object.isFrozen(received[0].payload)).toBe(true);
  });

  it("a subscriber assigning event.organizationId fails and the next one still sees org-a", async () => {
    const seen: string[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.a", (event) => {
              (event as { organizationId: string }).organizationId = "org-b";
            }),
            subscriber("probe.b", (event) => {
              seen.push(event.organizationId);
            }),
          ],
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(seen).toEqual(["org-a"]);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Event subscriber failed",
      expect.objectContaining({
        event: "users.invited",
        subscriber: "probe.a",
      }),
    );
  });

  it("a subscriber assigning a payload field fails and the next one sees the original value", async () => {
    const seen: unknown[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.a", (event) => {
              (event.payload as { role: string }).role = "owner";
            }),
            subscriber("probe.b", (event) => {
              seen.push(event.payload);
            }),
          ],
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(seen).toEqual([
      { invitationId: "i1", email: "a@b.c", role: "member" },
    ]);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it("an organizationId smuggled into the payload never reaches a subscriber", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": subscriber("probe.a", (event) => {
            received.push(event);
          }),
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", {
      ...INVITED_PAYLOAD,
      organizationId: "org-b",
    });

    expect(received).toHaveLength(1);
    expect(received[0].organizationId).toBe("org-a");
    expect(received[0].payload).not.toHaveProperty("organizationId");
    expect(received[0]).toEqual(INVITED_EVENT);
  });

  it("an actorUserId smuggled into the payload does not replace the origin actor", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": subscriber("probe.a", (event) => {
            received.push(event);
          }),
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", {
      ...INVITED_PAYLOAD,
      actorUserId: "intruder",
    });

    expect(received[0].actorUserId).toBe("u1");
    expect(received[0].payload).not.toHaveProperty("actorUserId");
  });
});

describe("createEventBus: construction problems", () => {
  it("an event key of module invoices without the invoices. prefix throws EventError", () => {
    const error = constructionError(() =>
      busWith(
        [],
        [
          {
            module: "invoices",
            value: defineEvents({ issued: z.object({}) }),
          },
        ],
      ),
    );

    expect(error.name).toBe("EventError");
    expect(error.message).toContain(
      'event keys must start with "invoices.": issued',
    );
  });

  it("the prefix includes the dot: invoicesx.issued in module invoices is rejected", () => {
    expect(() =>
      busWith(
        [],
        [
          {
            module: "invoices",
            value: defineEvents({ "invoicesx.issued": z.object({}) }),
          },
        ],
      ),
    ).toThrow('event keys must start with "invoices.": invoicesx.issued');
  });

  it("a module event that repeats a core event name throws duplicate event", () => {
    expect(() =>
      busWith(
        [],
        [
          {
            module: "users",
            value: defineEvents({
              "users.invited": z.object({ invitationId: z.string() }),
            }),
          },
        ],
      ),
    ).toThrow("duplicate event: users.invited");
  });

  it("the same event name in two module entries throws duplicate event", () => {
    expect(() =>
      busWith(
        [],
        [
          {
            module: "billing",
            value: defineEvents({ "billing.paid": z.object({}) }),
          },
          {
            module: "billing",
            value: defineEvents({ "billing.paid": z.object({}) }),
          },
        ],
      ),
    ).toThrow("duplicate event: billing.paid");
  });

  it("a module schema declaring organizationId throws", () => {
    expect(() =>
      busWith(
        [],
        [
          {
            module: "billing",
            value: defineEvents({
              "billing.paid": z.object({
                organizationId: z.string(),
                amount: z.number(),
              }),
            }),
          },
        ],
      ),
    ).toThrow(
      "event billing.paid must not declare organizationId; emitEvent sets it",
    );
  });

  it("a core schema declaring organizationId throws too", () => {
    expect(() =>
      createEventBus({
        core: defineEvents({
          "core.thing": z.object({ organizationId: z.string() }),
        }),
        events: [],
        subscribers: [],
      }),
    ).toThrow(
      "event core.thing must not declare organizationId; emitEvent sets it",
    );
  });

  it("a subscriber id of module billing without the billing. prefix throws", () => {
    expect(() =>
      busWith([
        {
          module: "billing",
          value: {
            "users.invited": subscriber("invoices.x", () => undefined),
          },
        },
      ]),
    ).toThrow('subscriber ids must start with "billing.": invoices.x');
  });

  it("a subscriber id equal to the module key, without the dot, is rejected", () => {
    expect(() =>
      busWith([
        {
          module: "billing",
          value: { "users.invited": subscriber("billing", () => undefined) },
        },
      ]),
    ).toThrow('subscriber ids must start with "billing.": billing');
  });

  it("a subscriber id used twice throws duplicate subscriber", () => {
    expect(() =>
      busWith([
        {
          module: "billing",
          value: {
            "users.invited": subscriber("billing.x", () => undefined),
            "auth.signed-up": subscriber("billing.x", () => undefined),
          },
        },
      ]),
    ).toThrow("duplicate subscriber: billing.x");
  });

  it("a subscriber id used twice in one array throws duplicate subscriber", () => {
    expect(() =>
      busWith([
        {
          module: "billing",
          value: {
            "users.invited": [
              subscriber("billing.x", () => undefined),
              subscriber("billing.x", () => undefined),
            ],
          },
        },
      ]),
    ).toThrow("duplicate subscriber: billing.x");
  });

  it("a subscriber on an undeclared event throws unknown event with the subscriber id", () => {
    expect(() =>
      busWith([
        {
          module: "billing",
          value: { "billing.nope": subscriber("billing.x", () => undefined) },
        },
      ]),
    ).toThrow("unknown event: billing.nope (subscriber billing.x)");
  });

  it("every construction error is an EventError", () => {
    const error = constructionError(() =>
      busWith([
        {
          module: "billing",
          value: { "billing.nope": subscriber("billing.x", () => undefined) },
        },
      ]),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EventError");
  });

  it("several problems give one error listing every problem on its own line, in the order of the checks", () => {
    const error = constructionError(() =>
      busWith(
        [
          {
            module: "billing",
            value: {
              "billing.nope": subscriber("billing.z", () => undefined),
              "users.invited": [
                subscriber("x.y", () => undefined),
                subscriber("billing.dup", () => undefined),
              ],
              "auth.signed-up": subscriber("billing.dup", () => undefined),
            },
          },
        ],
        [
          {
            module: "billing",
            value: defineEvents({
              issued: z.object({}),
              "billing.paid": z.object({ organizationId: z.string() }),
            }),
          },
          {
            module: "users",
            value: defineEvents({ "users.invited": z.object({}) }),
          },
        ],
      ),
    );
    const problems = [
      'event keys must start with "billing.": issued',
      "duplicate event: users.invited",
      "event billing.paid must not declare organizationId; emitEvent sets it",
      'subscriber ids must start with "billing.": x.y',
      "duplicate subscriber: billing.dup",
      "unknown event: billing.nope (subscriber billing.z)",
    ];
    const lines = error.message.split("\n");
    const lineOf = (problem: string) =>
      lines.findIndex((line) => line.includes(problem));

    expect(error.name).toBe("EventError");
    expect(problems.map(lineOf).every((index) => index >= 0)).toBe(true);
    expect(new Set(problems.map(lineOf)).size).toBe(6);
    expect(problems.map(lineOf)).toEqual(
      [...problems.map(lineOf)].sort((left, right) => left - right),
    );
  });

  it("a subscriber of a module without its own events entry on another module's event is fine", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith(
      [
        {
          module: "billing",
          value: {
            "invoices.issued": subscriber("billing.on-issued", (event) => {
              received.push(event);
            }),
          },
        },
      ],
      [
        {
          module: "invoices",
          value: defineEvents({
            "invoices.issued": z.object({ invoiceId: z.string() }),
          }),
        },
      ],
    );

    await bus.emit(ORIGIN, "invoices.issued", { invoiceId: "inv-1" });

    expect(received.map((event) => event.payload)).toEqual([
      { invoiceId: "inv-1" },
    ]);
  });

  it("the core events alone with no modules construct without an error", () => {
    expect(() =>
      createEventBus({ core: coreEvents, events: [], subscribers: [] }),
    ).not.toThrow();
  });

  it("a module whose keys all carry its prefix constructs without an error", () => {
    expect(() =>
      busWith(
        [
          {
            module: "invoices",
            value: {
              "invoices.issued": subscriber("invoices.a", () => undefined),
              "users.invited": subscriber("invoices.b", () => undefined),
            },
          },
        ],
        [
          {
            module: "invoices",
            value: defineEvents({
              "invoices.issued": z.object({ invoiceId: z.string() }),
              "invoices.paid": z.object({ invoiceId: z.string() }),
            }),
          },
        ],
      ),
    ).not.toThrow();
  });
});

describe("createEventBus: the payload is deep-frozen", () => {
  function metaBus(subscribers: Record<string, unknown>) {
    return busWith(
      [{ module: "m", value: subscribers }],
      [
        {
          module: "m",
          value: defineEvents({
            "m.tagged": z.object({
              meta: z.object({ tags: z.array(z.string()) }),
            }),
          }),
        },
      ],
    );
  }

  it("pushing to a nested array and assigning a nested field both throw TypeError and the next subscriber sees the original payload", async () => {
    const seen: unknown[] = [];
    const frozen: boolean[] = [];
    const bus = metaBus({
      "m.tagged": [
        subscriber("m.a-push", (event) => {
          (event.payload as { meta: { tags: string[] } }).meta.tags.push("b");
        }),
        subscriber("m.b-assign", (event) => {
          (event.payload as { meta: Record<string, unknown> }).meta.x = 1;
        }),
        subscriber("m.c-read", (event) => {
          const payload = event.payload as { meta: { tags: string[] } };
          seen.push(payload);
          frozen.push(
            Object.isFrozen(payload.meta),
            Object.isFrozen(payload.meta.tags),
          );
        }),
      ],
    });

    await bus.emit(ORIGIN, "m.tagged", { meta: { tags: ["a"] } });

    expect(seen).toEqual([{ meta: { tags: ["a"] } }]);
    expect(frozen).toEqual([true, true]);
    expect(mockLogger.error.mock.calls).toEqual([
      [
        "Event subscriber failed",
        {
          event: "m.tagged",
          subscriber: "m.a-push",
          error: expect.any(TypeError),
        },
      ],
      [
        "Event subscriber failed",
        {
          event: "m.tagged",
          subscriber: "m.b-assign",
          error: expect.any(TypeError),
        },
      ],
    ]);
  });

  it("objects inside an array of the payload are frozen too", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith(
      [
        {
          module: "m",
          value: {
            "m.listed": subscriber("m.read", (event) => {
              received.push(event);
            }),
          },
        },
      ],
      [
        {
          module: "m",
          value: defineEvents({
            "m.listed": z.object({
              items: z.array(
                z.object({ id: z.string(), tags: z.array(z.string()) }),
              ),
            }),
          }),
        },
      ],
    );

    await bus.emit(ORIGIN, "m.listed", {
      items: [{ id: "i1", tags: ["t"] }],
    });

    const payload = received[0].payload as {
      items: { id: string; tags: string[] }[];
    };
    expect(Object.isFrozen(payload.items)).toBe(true);
    expect(Object.isFrozen(payload.items[0])).toBe(true);
    expect(Object.isFrozen(payload.items[0].tags)).toBe(true);
  });
});

describe("createEventBus: event schemas must be strip-mode z.object()", () => {
  function moduleEventBus(schema: unknown) {
    return () =>
      busWith([], [{ module: "m", value: { "m.x": schema } as EventMap }]);
  }

  it.each([
    ["z.looseObject", z.looseObject({ a: z.string() })],
    ["passthrough()", z.object({ a: z.string() }).passthrough()],
    ["loose()", z.object({ a: z.string() }).loose()],
    ["catchall(z.string())", z.object({ a: z.string() }).catchall(z.string())],
    ["z.strictObject", z.strictObject({ a: z.string() })],
    ["strict()", z.object({ a: z.string() }).strict()],
  ])(
    "a module event built with %s throws EventError: must be a z.object() that strips unknown keys",
    (_label, schema) => {
      const error = constructionError(moduleEventBus(schema));

      expect(error).toBeInstanceOf(EventError);
      expect(error.message).toContain(
        "event m.x must be a z.object() that strips unknown keys",
      );
      expect(error.message).not.toContain(
        "event m.x must be a z.object() schema",
      );
    },
  );

  it("a module event that is a transform, not a ZodObject, throws EventError: must be a z.object() schema", () => {
    const error = constructionError(
      moduleEventBus(z.object({ a: z.string() }).transform((value) => value)),
    );

    expect(error).not.toBeInstanceOf(TypeError);
    expect(error).toBeInstanceOf(EventError);
    expect(error.message).toContain("event m.x must be a z.object() schema");
    expect(error.message).not.toContain("strips unknown keys");
  });

  it("a module event that is a z.string() throws EventError: must be a z.object() schema", () => {
    const error = constructionError(moduleEventBus(z.string()));

    expect(error).toBeInstanceOf(EventError);
    expect(error.message).toContain("event m.x must be a z.object() schema");
  });

  it("a plain z.object() module event constructs without an error", () => {
    expect(moduleEventBus(z.object({ a: z.string() }))).not.toThrow();
  });

  it("a core event built with z.looseObject throws EventError too", () => {
    const error = constructionError(() =>
      createEventBus({
        core: { "core.thing": z.looseObject({ a: z.string() }) } as EventMap,
        events: [],
        subscribers: [],
      }),
    );

    expect(error).toBeInstanceOf(EventError);
    expect(error.message).toContain(
      "event core.thing must be a z.object() that strips unknown keys",
    );
  });

  it("a core event that is a transform throws EventError: must be a z.object() schema", () => {
    const error = constructionError(() =>
      createEventBus({
        core: {
          "core.thing": z.object({ a: z.string() }).transform((value) => value),
        } as unknown as EventMap,
        events: [],
        subscribers: [],
      }),
    );

    expect(error).toBeInstanceOf(EventError);
    expect(error.message).toContain(
      "event core.thing must be a z.object() schema",
    );
  });

  it("schema problems join the other registry problems in one EventError, one line each", () => {
    const error = constructionError(() =>
      busWith(
        [
          {
            module: "m",
            value: { "m.nope": subscriber("m.z", () => undefined) },
          },
        ],
        [
          {
            module: "m",
            value: {
              issued: z.object({}),
              "m.loose": z.looseObject({}),
              "m.mapped": z.object({}).transform((value) => value),
            } as unknown as EventMap,
          },
        ],
      ),
    );
    const lines = error.message.split("\n");
    const problems = [
      'event keys must start with "m.": issued',
      "event m.loose must be a z.object() that strips unknown keys",
      "event m.mapped must be a z.object() schema",
      "unknown event: m.nope (subscriber m.z)",
    ];
    const lineOf = (problem: string) =>
      lines.findIndex((line) => line.includes(problem));

    expect(error).toBeInstanceOf(EventError);
    expect(problems.map(lineOf).every((index) => index >= 0)).toBe(true);
    expect(new Set(problems.map(lineOf)).size).toBe(4);
  });

  it("an organizationId sent with a plain z.object() schema is stripped before the subscriber", async () => {
    const received: DomainEvent[] = [];
    const bus = busWith(
      [
        {
          module: "m",
          value: {
            "m.x": subscriber("m.read", (event) => {
              received.push(event);
            }),
          },
        },
      ],
      [
        {
          module: "m",
          value: defineEvents({ "m.x": z.object({ a: z.string() }) }),
        },
      ],
    );

    await bus.emit(ORIGIN, "m.x", { a: "v", organizationId: "org-evil" });

    expect(received).toEqual([
      {
        name: "m.x",
        organizationId: "org-a",
        actorUserId: "u1",
        serviceMode: false,
        payload: { a: "v" },
      },
    ]);
  });
});

describe("createEventBus: nested emits are capped at depth 8", () => {
  const RUNAWAY_GUARD = 20;
  const NESTED_EVENTS = [
    {
      module: "m",
      value: defineEvents({
        "m.a": z.object({}),
        "m.b": z.object({}),
        "m.c": z.object({ chain: z.string() }),
      }),
    },
  ];

  function nestedBus(subscribers: Record<string, unknown>): EventBus {
    return busWith([{ module: "m", value: subscribers }], NESTED_EVENTS);
  }

  function pingPongBus(runs: { a: number; b: number }): EventBus {
    const bus: EventBus = nestedBus({
      "m.a": subscriber("m.on-a", async () => {
        runs.a += 1;
        if (runs.a < RUNAWAY_GUARD) {
          await bus.emit(ORIGIN, "m.b", {});
        }
      }),
      "m.b": subscriber("m.on-b", async () => {
        runs.b += 1;
        if (runs.b < RUNAWAY_GUARD) {
          await bus.emit(ORIGIN, "m.a", {});
        }
      }),
    });
    return bus;
  }

  function counterBus(limit: number, runs: { count: number }): EventBus {
    const bus: EventBus = nestedBus({
      "m.a": subscriber("m.count", async () => {
        runs.count += 1;
        if (runs.count < limit && runs.count < RUNAWAY_GUARD) {
          await bus.emit(ORIGIN, "m.a", {});
        }
      }),
    });
    return bus;
  }

  it("m.a -> m.b -> m.a ping-pong runs each subscriber 4 times, logs Event depth exceeded once for m.a and resolves", async () => {
    const runs = { a: 0, b: 0 };
    const bus = pingPongBus(runs);

    await expect(bus.emit(ORIGIN, "m.a", {})).resolves.toBeUndefined();

    expect(runs).toEqual({ a: 4, b: 4 });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith("Event depth exceeded", {
      event: "m.a",
      error: expect.any(EventError),
    });
    const { error } = mockLogger.error.mock.calls[0][1] as { error: Error };
    expect(error.name).toBe("EventError");
    expect(error.message).toBe("event depth exceeded 8: m.a");
  });

  it("the overflow is not reported as a subscriber failure", async () => {
    const bus = pingPongBus({ a: 0, b: 0 });

    await bus.emit(ORIGIN, "m.a", {});

    expect(
      mockLogger.error.mock.calls.filter(
        ([message]) => message === "Event subscriber failed",
      ),
    ).toEqual([]);
  });

  it("a chain of exactly 8 emits runs 8 times and logs nothing", async () => {
    const runs = { count: 0 };
    const bus = counterBus(8, runs);

    await bus.emit(ORIGIN, "m.a", {});

    expect(runs.count).toBe(8);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("a chain that wants 9 emits stops after 8 runs and logs the 9th once", async () => {
    const runs = { count: 0 };
    const bus = counterBus(9, runs);

    await bus.emit(ORIGIN, "m.a", {});

    expect(runs.count).toBe(8);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error.mock.calls[0][0]).toBe("Event depth exceeded");
    expect(
      (mockLogger.error.mock.calls[0][1] as { error: Error }).error.message,
    ).toBe("event depth exceeded 8: m.a");
  });

  it("a second top-level emit after an overflowing chain starts at depth 0 again", async () => {
    const runs = { a: 0, b: 0 };
    const bus = pingPongBus(runs);
    await bus.emit(ORIGIN, "m.a", {});
    runs.a = 0;
    runs.b = 0;

    await bus.emit(ORIGIN, "m.a", {});

    expect(runs).toEqual({ a: 4, b: 4 });
    expect(mockLogger.error).toHaveBeenCalledTimes(2);
  });

  it("three sibling emits of m.b from one subscriber run m.on-b 3 times and log nothing", async () => {
    const log: string[] = [];
    const bus: EventBus = nestedBus({
      "m.a": subscriber("m.on-a", async () => {
        await bus.emit(ORIGIN, "m.b", {});
        await bus.emit(ORIGIN, "m.b", {});
        await bus.emit(ORIGIN, "m.b", {});
      }),
      "m.b": recorder(log, "m.on-b"),
    });

    await bus.emit(ORIGIN, "m.a", {});

    expect(log).toEqual(["m.on-b", "m.on-b", "m.on-b"]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("ten sibling emits at depth 1 do not add up to the cap", async () => {
    const log: string[] = [];
    const bus: EventBus = nestedBus({
      "m.a": subscriber("m.on-a", async () => {
        for (const round of [
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
        ]) {
          await bus.emit(ORIGIN, "m.c", { chain: round });
        }
      }),
      "m.c": subscriber("m.on-c", (event) => {
        log.push((event.payload as { chain: string }).chain);
      }),
    });

    await bus.emit(ORIGIN, "m.a", {});

    expect(log).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("ten sequential top-level emits each run their subscriber", async () => {
    const log: string[] = [];
    const bus = nestedBus({
      "m.c": subscriber("m.on-c", (event) => {
        log.push((event.payload as { chain: string }).chain);
      }),
    });

    for (const round of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
      await bus.emit(ORIGIN, "m.c", { chain: round });
    }

    expect(log).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("two concurrent chains of 8 emits do not add up their depths", async () => {
    const runs: Record<string, number> = { x: 0, y: 0 };
    const bus: EventBus = nestedBus({
      "m.c": subscriber("m.chain", async (event) => {
        const { chain } = event.payload as { chain: string };
        runs[chain] += 1;
        await Promise.resolve();
        if (runs[chain] < 8) {
          await bus.emit(ORIGIN, "m.c", { chain });
        }
      }),
    });

    await Promise.all([
      bus.emit(ORIGIN, "m.c", { chain: "x" }),
      bus.emit(ORIGIN, "m.c", { chain: "y" }),
    ]);

    expect(runs).toEqual({ x: 8, y: 8 });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("the depth is per bus: a chain of 8 on one bus leaves another bus at depth 0", async () => {
    const runs = { count: 0 };
    const otherLog: string[] = [];
    const other = nestedBus({ "m.b": recorder(otherLog, "m.on-b") });
    const bus: EventBus = nestedBus({
      "m.a": subscriber("m.count", async () => {
        runs.count += 1;
        if (runs.count < 8) {
          await bus.emit(ORIGIN, "m.a", {});
          return;
        }
        await other.emit(ORIGIN, "m.b", {});
      }),
    });

    await bus.emit(ORIGIN, "m.a", {});

    expect(runs.count).toBe(8);
    expect(otherLog).toEqual(["m.on-b"]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

describe("createEventBus: service mode comes only from the origin", () => {
  function receivingBus(received: DomainEvent[]) {
    return busWith([
      {
        module: "probe",
        value: {
          "users.invited": subscriber("probe.a", (event) => {
            received.push(event);
          }),
        },
      },
    ]);
  }

  it("an origin with serviceMode true delivers serviceMode true", async () => {
    const received: DomainEvent[] = [];

    await receivingBus(received).emit(
      { organizationId: "org-a", actorUserId: "u1", serviceMode: true },
      "users.invited",
      INVITED_PAYLOAD,
    );

    expect(received).toEqual([
      {
        name: "users.invited",
        organizationId: "org-a",
        actorUserId: "u1",
        serviceMode: true,
        payload: { invitationId: "i1", email: "a@b.c", role: "member" },
      },
    ]);
  });

  it("an origin with serviceMode false delivers serviceMode false", async () => {
    const received: DomainEvent[] = [];

    await receivingBus(received).emit(
      { organizationId: "org-a", actorUserId: "u1", serviceMode: false },
      "users.invited",
      INVITED_PAYLOAD,
    );

    expect(received).toHaveLength(1);
    expect(received[0].serviceMode).toBe(false);
  });

  it("an origin without serviceMode delivers serviceMode false, not undefined", async () => {
    const received: DomainEvent[] = [];

    await receivingBus(received).emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(received).toHaveLength(1);
    expect(received[0].serviceMode).toBe(false);
    expect(received[0]).toHaveProperty("serviceMode", false);
  });

  it("a truthy non-boolean serviceMode on the origin delivers serviceMode false", async () => {
    const received: DomainEvent[] = [];

    await receivingBus(received).emit(
      {
        organizationId: "org-a",
        actorUserId: "u1",
        serviceMode: "true" as unknown as boolean,
      },
      "users.invited",
      INVITED_PAYLOAD,
    );

    expect(received).toHaveLength(1);
    expect(received[0].serviceMode).toBe(false);
  });

  it("serviceMode true smuggled into the payload reaches neither event.serviceMode nor the payload", async () => {
    const received: DomainEvent[] = [];

    await receivingBus(received).emit(ORIGIN, "users.invited", {
      ...INVITED_PAYLOAD,
      serviceMode: true,
    } as typeof INVITED_PAYLOAD);

    expect(received).toHaveLength(1);
    expect(received[0].serviceMode).toBe(false);
    expect(received[0].payload).not.toHaveProperty("serviceMode");
    expect(received[0]).toEqual(INVITED_EVENT);
  });

  it("serviceMode false in the payload does not clear serviceMode true of the origin", async () => {
    const received: DomainEvent[] = [];

    await receivingBus(received).emit(
      { organizationId: "org-a", actorUserId: "u1", serviceMode: true },
      "users.invited",
      { ...INVITED_PAYLOAD, serviceMode: false } as typeof INVITED_PAYLOAD,
    );

    expect(received).toHaveLength(1);
    expect(received[0].serviceMode).toBe(true);
    expect(received[0].payload).not.toHaveProperty("serviceMode");
  });

  it("a subscriber assigning event.serviceMode fails and the next one still sees the origin value", async () => {
    const seen: boolean[] = [];
    const bus = busWith([
      {
        module: "probe",
        value: {
          "users.invited": [
            subscriber("probe.a", (event) => {
              (event as { serviceMode: boolean }).serviceMode = true;
            }),
            subscriber("probe.b", (event) => {
              seen.push(event.serviceMode);
            }),
          ],
        },
      },
    ]);

    await bus.emit(ORIGIN, "users.invited", INVITED_PAYLOAD);

    expect(seen).toEqual([false]);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });
});
