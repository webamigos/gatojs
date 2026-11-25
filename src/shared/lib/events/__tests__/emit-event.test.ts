import { beforeEach, describe, expect, it, vi } from "vitest";

const { received, disabledRan, mockLogger } = vi.hoisted(() => ({
  received: [] as unknown[],
  disabledRan: [] as unknown[],
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/modules.generated", async (importOriginal) => {
  const { enabledModuleEntries } =
    await import("@/shared/lib/modules/gato-config");
  return {
    ...(await importOriginal<typeof import("@/modules.generated")>()),
    moduleEvents: [],
    moduleSubscribers: enabledModuleEntries(
      [
        {
          module: "invoices",
          value: {
            "users.invited": {
              id: "invoices.on-invited",
              run: (event: unknown) => {
                disabledRan.push(event);
              },
            },
          },
        },
        {
          module: "probe",
          value: {
            "users.invited": {
              id: "probe.record",
              run: (event: unknown) => {
                received.push(event);
              },
            },
          },
        },
      ],
      { modules: { invoices: { enabled: false } } },
    ),
  };
});

import { emitEvent, eventOrigin } from "@/shared/lib/events";

const ORIGIN = { organizationId: "org-a", actorUserId: "u1" };

beforeEach(() => {
  received.length = 0;
  disabledRan.length = 0;
});

describe("eventOrigin", () => {
  it("maps the context organization and user to the origin", () => {
    expect(
      eventOrigin({
        organizationId: "org-a",
        userId: "u1",
        orgRole: "member",
        userRole: "user",
        serviceMode: false,
      }),
    ).toStrictEqual({ organizationId: "org-a", actorUserId: "u1" });
  });

  it("in service mode the superadmin is the actor of the entered organization", () => {
    expect(
      eventOrigin({
        organizationId: "org-b",
        userId: "super-1",
        orgRole: "owner",
        userRole: "superadmin",
        serviceMode: true,
      }),
    ).toStrictEqual({ organizationId: "org-b", actorUserId: "super-1" });
  });
});

describe("emitEvent", () => {
  it("delivers users.invited from the registry to a subscriber with the origin and the payload", async () => {
    await emitEvent(ORIGIN, "users.invited", {
      invitationId: "i1",
      email: "a@b.c",
      role: "member",
    });

    expect(received).toEqual([
      {
        name: "users.invited",
        organizationId: "org-a",
        actorUserId: "u1",
        payload: { invitationId: "i1", email: "a@b.c", role: "member" },
      },
    ]);
  });

  it("a disabled module's subscribers do not run", async () => {
    await emitEvent(ORIGIN, "users.invited", {
      invitationId: "i1",
      email: "a@b.c",
      role: "member",
    });

    expect(disabledRan).toEqual([]);
    expect(received).toHaveLength(1);
  });

  it("an organizationId in the payload is a type error and never reaches the subscriber", async () => {
    await emitEvent(ORIGIN, "users.invited", {
      invitationId: "i1",
      email: "a@b.c",
      role: "member",
      // @ts-expect-error the organization comes from the origin, never from the payload
      organizationId: "x",
    });

    expect(received).toEqual([
      {
        name: "users.invited",
        organizationId: "org-a",
        actorUserId: "u1",
        payload: { invitationId: "i1", email: "a@b.c", role: "member" },
      },
    ]);
  });

  it("an event the subscriber does not listen to is not delivered to it", async () => {
    await emitEvent(ORIGIN, "auth.signed-up", { userId: "u1", email: "a@b.c" });

    expect(received).toEqual([]);
  });

  it("an unknown event name rejects at runtime too", async () => {
    await expect(
      emitEvent(ORIGIN, "users.nope" as never, {} as never),
    ).rejects.toMatchObject({
      name: "EventError",
      message: "unknown event: users.nope",
    });
  });

  it("an invalid payload rejects before the subscriber runs", async () => {
    await expect(
      emitEvent(ORIGIN, "users.invited", {
        invitationId: "i1",
        email: "a@b.c",
        role: "boss" as "member",
      }),
    ).rejects.toThrow("invalid payload for users.invited");
    expect(received).toEqual([]);
  });

  it("the bus is built once: repeated emits reach the same subscriber each time", async () => {
    await emitEvent(ORIGIN, "users.invited", {
      invitationId: "i1",
      email: "a@b.c",
      role: "member",
    });
    await emitEvent(
      { organizationId: "org-b", actorUserId: null },
      "users.invited",
      { invitationId: "i2", email: "d@e.f", role: "admin" },
    );

    expect(received).toEqual([
      {
        name: "users.invited",
        organizationId: "org-a",
        actorUserId: "u1",
        payload: { invitationId: "i1", email: "a@b.c", role: "member" },
      },
      {
        name: "users.invited",
        organizationId: "org-b",
        actorUserId: null,
        payload: { invitationId: "i2", email: "d@e.f", role: "admin" },
      },
    ]);
  });
});
