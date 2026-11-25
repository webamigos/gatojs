import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

import { coreEvents } from "../core-events";
import { defineEvents, type DomainEvent } from "../define-events";
import { createEventBus } from "../event-bus";

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
