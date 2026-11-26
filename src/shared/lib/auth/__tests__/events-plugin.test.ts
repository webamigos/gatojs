import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger, emitEvent } = vi.hoisted(() => ({
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  emitEvent: vi.fn(),
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/shared/lib/events/emit-event", () => ({ emitEvent }));

import { EventError } from "@/shared/lib/events/define-events";
import { eventsPlugin } from "../events-plugin";

type HookContext = Record<string, unknown>;

interface Hook {
  matcher: (context: { path?: string }) => boolean;
  handler: (ctx: HookContext) => Promise<unknown>;
}

interface EmittedEvent {
  organizationId: unknown;
  actorUserId: unknown;
  serviceMode: unknown;
  name: unknown;
  payload: unknown;
}

const UPDATE_ROLE = "/organization/update-member-role";

const SESSION = {
  user: { id: "user-actor", email: "actor@a.example" },
  session: { id: "session-1", activeOrganizationId: "org-active" },
};

const invitation = {
  id: "inv-1",
  organizationId: "org-invitation",
  email: "nowy@a.example",
  role: "member",
  status: "pending",
  inviterId: "user-actor",
};

const member = {
  id: "mem-1",
  organizationId: "org-member",
  userId: "user-member",
  role: "admin",
};

function hooksOf(kind: "before" | "after"): Hook[] {
  const hooks = eventsPlugin.hooks as unknown as Partial<
    Record<"before" | "after", Hook[]>
  >;
  return hooks[kind] ?? [];
}

function matching(kind: "before" | "after", path: string | undefined): Hook[] {
  return hooksOf(kind).filter((hook) => hook.matcher({ path }));
}

function findOneReturning(row: unknown) {
  return vi.fn(async () => row);
}

async function runBefore(
  body: unknown,
  findOne: ReturnType<typeof vi.fn>,
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const hook of matching("before", UPDATE_ROLE)) {
    results.push(
      await hook.handler({
        path: UPDATE_ROLE,
        body,
        headers: new Headers(),
        context: { adapter: { findOne } },
      }),
    );
  }
  return results;
}

function previousRoleIn(result: unknown): unknown {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  const { context } = result as { context?: Record<string, unknown> };
  return context?.previousMemberRole;
}

async function runAfter(input: {
  path: string;
  returned: unknown;
  session?: unknown;
  merged?: HookContext;
}): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const hook of matching("after", input.path)) {
    results.push(
      await hook.handler({
        path: input.path,
        body: {},
        headers: new Headers(),
        ...input.merged,
        context:
          input.session === undefined
            ? { returned: input.returned }
            : { returned: input.returned, session: input.session },
      }),
    );
  }
  return results;
}

// WHY: better-auth merges the `context` a before hook returns into the endpoint context the
// after hooks receive; this mirrors that hand-over without running a whole auth instance.
async function runUpdateRolePipeline(input: {
  bodyMemberId: string;
  storedRow: unknown;
  returned: unknown;
}): Promise<unknown[]> {
  const findOne = findOneReturning(input.storedRow);
  const merged: HookContext = {};
  for (const result of await runBefore(
    { memberId: input.bodyMemberId, role: "admin" },
    findOne,
  )) {
    const context = (result as { context?: HookContext } | undefined)?.context;
    Object.assign(merged, context);
  }
  return runAfter({
    path: UPDATE_ROLE,
    returned: input.returned,
    session: SESSION,
    merged,
  });
}

function emitted(): EmittedEvent[] {
  return emitEvent.mock.calls.map(([origin, name, payload]) => {
    const { organizationId, actorUserId, serviceMode, ...rest } = origin as {
      organizationId: unknown;
      actorUserId: unknown;
      serviceMode?: unknown;
    };
    expect(rest).toEqual({});
    return {
      organizationId,
      actorUserId,
      serviceMode: serviceMode ?? false,
      name,
      payload,
    };
  });
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  emitEvent.mockReset();
  emitEvent.mockResolvedValue(undefined);
  mockLogger.error.mockReset();
});

describe("eventsPlugin: identity and matchers", () => {
  it("has the id gato-events", () => {
    expect(eventsPlugin.id).toBe("gato-events");
  });

  it("has exactly one before hook for /organization/update-member-role", () => {
    expect(matching("before", UPDATE_ROLE)).toHaveLength(1);
  });

  it.each([
    "/organization/create",
    "/organization/invite-member",
    "/organization/cancel-invitation",
    "/organization/accept-invitation",
    "/organization/remove-member",
    "/organization/set-active",
    "/sign-up/email",
    undefined,
  ])("has no before hook for %s", (path) => {
    expect(matching("before", path)).toHaveLength(0);
  });

  it.each([
    "/organization/create",
    "/organization/invite-member",
    "/organization/cancel-invitation",
    "/organization/accept-invitation",
    UPDATE_ROLE,
    "/organization/remove-member",
  ])("has exactly one after hook for %s", (path) => {
    expect(matching("after", path)).toHaveLength(1);
  });

  it.each([
    "/organization/update",
    "/organization/delete",
    "/organization/leave",
    "/organization/set-active",
    "/organization/reject-invitation",
    "/organization/list-members",
    "/sign-up/email",
    "/admin/set-role",
    undefined,
  ])("has no after hook for %s", (path) => {
    expect(matching("after", path)).toHaveLength(0);
  });
});

describe("eventsPlugin: before hook on /organization/update-member-role", () => {
  it("reads the stored member by body.memberId and returns its role as previousMemberRole", async () => {
    const findOne = findOneReturning({
      id: "mem-1",
      organizationId: "org-member",
      userId: "user-member",
      role: "member",
    });

    const results = await runBefore(
      { memberId: "mem-1", role: "admin" },
      findOne,
    );

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({
      model: "member",
      where: [{ field: "id", value: "mem-1" }],
    });
    expect(results).toEqual([
      {
        context: { previousMemberRole: { memberId: "mem-1", role: "member" } },
      },
    ]);
  });

  it.each([
    ["a numeric memberId", { memberId: 7, role: "admin" }],
    ["an object memberId", { memberId: { id: "mem-1" }, role: "admin" }],
    ["no memberId", { role: "admin" }],
    ["a null body", null],
    ["no body", undefined],
  ])(
    "does no lookup and sets no previous role for %s",
    async (_label, body) => {
      const findOne = findOneReturning({ id: "mem-1", role: "member" });

      const results = await runBefore(body, findOne);

      expect(findOne).not.toHaveBeenCalled();
      expect(results.map(previousRoleIn)).toEqual([undefined]);
    },
  );

  it("sets no previous role when the member is not found", async () => {
    const findOne = findOneReturning(null);

    const results = await runBefore(
      { memberId: "mem-404", role: "admin" },
      findOne,
    );

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(results.map(previousRoleIn)).toEqual([undefined]);
  });
});

describe("eventsPlugin: after hooks emit core events", () => {
  it("/organization/remove-member emits organizations.member-removed in the member's organization with the session actor", async () => {
    const results = await runAfter({
      path: "/organization/remove-member",
      returned: { member },
      session: SESSION,
    });

    expect(emitted()).toEqual([
      {
        organizationId: "org-member",
        actorUserId: "user-actor",
        serviceMode: false,
        name: "organizations.member-removed",
        payload: { memberId: "mem-1", userId: "user-member", role: "admin" },
      },
    ]);
    expect(results).toEqual([undefined]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("/organization/invite-member emits users.invited in the invitation's organization", async () => {
    await runAfter({
      path: "/organization/invite-member",
      returned: invitation,
      session: SESSION,
    });

    expect(emitted()).toEqual([
      {
        organizationId: "org-invitation",
        actorUserId: "user-actor",
        serviceMode: false,
        name: "users.invited",
        payload: {
          invitationId: "inv-1",
          email: "nowy@a.example",
          role: "member",
        },
      },
    ]);
  });

  it("/organization/cancel-invitation emits users.invitation-canceled", async () => {
    await runAfter({
      path: "/organization/cancel-invitation",
      returned: { ...invitation, status: "canceled" },
      session: SESSION,
    });

    expect(emitted()).toEqual([
      {
        organizationId: "org-invitation",
        actorUserId: "user-actor",
        serviceMode: false,
        name: "users.invitation-canceled",
        payload: { invitationId: "inv-1" },
      },
    ]);
  });

  it("/organization/create emits organizations.created for the returned organization", async () => {
    await runAfter({
      path: "/organization/create",
      returned: {
        id: "org-created",
        name: "Acme",
        slug: "acme",
        members: [
          {
            id: "mem-owner",
            organizationId: "org-created",
            userId: "user-actor",
            role: "owner",
          },
        ],
      },
      session: SESSION,
    });

    expect(emitted()).toEqual([
      {
        organizationId: "org-created",
        actorUserId: "user-actor",
        serviceMode: false,
        name: "organizations.created",
        payload: { name: "Acme", slug: "acme", ownerUserId: "user-actor" },
      },
    ]);
  });

  it("/organization/accept-invitation emits users.invitation-accepted then organizations.member-added", async () => {
    await runAfter({
      path: "/organization/accept-invitation",
      returned: { invitation: { ...invitation, status: "accepted" }, member },
      session: SESSION,
    });

    expect(emitted()).toEqual([
      {
        organizationId: "org-invitation",
        actorUserId: "user-actor",
        serviceMode: false,
        name: "users.invitation-accepted",
        payload: { invitationId: "inv-1", userId: "user-member" },
      },
      {
        organizationId: "org-member",
        actorUserId: "user-actor",
        serviceMode: false,
        name: "organizations.member-added",
        payload: { memberId: "mem-1", userId: "user-member", role: "admin" },
      },
    ]);
  });

  it("the second emit starts only after the first one settled", async () => {
    const first = deferred();
    const timeline: string[] = [];
    emitEvent
      .mockImplementationOnce(async (_origin: unknown, name: string) => {
        timeline.push(`${name}:start`);
        await first.promise;
        timeline.push(`${name}:end`);
      })
      .mockImplementationOnce(async (_origin: unknown, name: string) => {
        timeline.push(`${name}:start`);
      });

    const running = runAfter({
      path: "/organization/accept-invitation",
      returned: { invitation, member },
      session: SESSION,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(timeline).toEqual(["users.invitation-accepted:start"]);
    first.resolve();
    await running;
    expect(timeline).toEqual([
      "users.invitation-accepted:start",
      "users.invitation-accepted:end",
      "organizations.member-added:start",
    ]);
  });

  it("without a session the actor is null", async () => {
    await runAfter({
      path: "/organization/remove-member",
      returned: { member },
    });

    expect(emitted()).toEqual([
      {
        organizationId: "org-member",
        actorUserId: null,
        serviceMode: false,
        name: "organizations.member-removed",
        payload: { memberId: "mem-1", userId: "user-member", role: "admin" },
      },
    ]);
  });

  it("/organization/update-member-role emits the role read by the before hook as previousRole", async () => {
    const results = await runUpdateRolePipeline({
      bodyMemberId: "mem-1",
      storedRow: { ...member, role: "member" },
      returned: member,
    });

    expect(emitted()).toEqual([
      {
        organizationId: "org-member",
        actorUserId: "user-actor",
        serviceMode: false,
        name: "organizations.member-role-changed",
        payload: {
          memberId: "mem-1",
          userId: "user-member",
          previousRole: "member",
          role: "admin",
        },
      },
    ]);
    expect(results).toEqual([undefined]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it.each([
    "/organization/create",
    "/organization/invite-member",
    "/organization/cancel-invitation",
    "/organization/accept-invitation",
    UPDATE_ROLE,
    "/organization/remove-member",
  ])(
    "%s with an APIError as the returned value emits nothing and logs nothing",
    async (path) => {
      const results = await runAfter({
        path,
        returned: new APIError("BAD_REQUEST", { message: "Member not found" }),
        session: SESSION,
        merged: { previousMemberRole: { memberId: "mem-1", role: "member" } },
      });

      expect(emitEvent).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(results).toEqual([undefined]);
    },
  );
});

describe("eventsPlugin: a failing emit", () => {
  it("a rejected first emit is logged with path, event and error, and the second emit still runs", async () => {
    const boom = new EventError(
      "invalid payload for users.invitation-accepted",
    );
    emitEvent.mockRejectedValueOnce(boom);

    const results = await runAfter({
      path: "/organization/accept-invitation",
      returned: { invitation, member },
      session: SESSION,
    });

    expect(emitted().map((event) => event.name)).toEqual([
      "users.invitation-accepted",
      "organizations.member-added",
    ]);
    expect(mockLogger.error.mock.calls).toEqual([
      [
        "Auth event failed",
        {
          path: "/organization/accept-invitation",
          event: "users.invitation-accepted",
          error: boom,
        },
      ],
    ]);
    expect(results).toEqual([undefined]);
  });

  it("an emit that throws synchronously is logged and the next emit still runs", async () => {
    const boom = new Error("bus down");
    emitEvent.mockImplementationOnce(() => {
      throw boom;
    });

    await expect(
      runAfter({
        path: "/organization/accept-invitation",
        returned: { invitation, member },
        session: SESSION,
      }),
    ).resolves.toEqual([undefined]);

    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith("Auth event failed", {
      path: "/organization/accept-invitation",
      event: "users.invitation-accepted",
      error: boom,
    });
  });

  it("two rejected emits are logged once each, in order", async () => {
    const first = new Error("first");
    const second = new Error("second");
    emitEvent.mockRejectedValueOnce(first).mockRejectedValueOnce(second);

    await runAfter({
      path: "/organization/accept-invitation",
      returned: { invitation, member },
      session: SESSION,
    });

    expect(mockLogger.error.mock.calls).toEqual([
      [
        "Auth event failed",
        {
          path: "/organization/accept-invitation",
          event: "users.invitation-accepted",
          error: first,
        },
      ],
      [
        "Auth event failed",
        {
          path: "/organization/accept-invitation",
          event: "organizations.member-added",
          error: second,
        },
      ],
    ]);
  });

  it("an invite whose emit fails (invalid role) is logged without the email and the response is unchanged", async () => {
    const invalid = new EventError("invalid payload for users.invited");
    emitEvent.mockRejectedValueOnce(invalid);

    const results = await runAfter({
      path: "/organization/invite-member",
      returned: { ...invitation, role: "boss" },
      session: SESSION,
    });

    expect(results).toEqual([undefined]);
    expect(mockLogger.error.mock.calls).toEqual([
      [
        "Auth event failed",
        {
          path: "/organization/invite-member",
          event: "users.invited",
          error: invalid,
        },
      ],
    ]);
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
      "nowy@a.example",
    );
  });
});

describe("eventsPlugin: update-member-role without a known previous role", () => {
  it("a returned member with no previous role emits nothing and logs the skip", async () => {
    const results = await runUpdateRolePipeline({
      bodyMemberId: "mem-1",
      storedRow: null,
      returned: member,
    });

    expect(emitEvent).not.toHaveBeenCalled();
    expect(mockLogger.error.mock.calls).toEqual([
      [
        "Auth event skipped",
        {
          path: UPDATE_ROLE,
          memberId: "mem-1",
          reason: "previous role unknown",
        },
      ],
    ]);
    expect(results).toEqual([undefined]);
  });

  it("a previous role of another member emits nothing and logs the skip", async () => {
    await runAfter({
      path: UPDATE_ROLE,
      returned: member,
      session: SESSION,
      merged: { previousMemberRole: { memberId: "mem-other", role: "member" } },
    });

    expect(emitEvent).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Auth event skipped",
      expect.objectContaining({
        path: UPDATE_ROLE,
        reason: "previous role unknown",
      }),
    );
  });

  it.each([
    "/organization/create",
    "/organization/invite-member",
    "/organization/accept-invitation",
    "/organization/remove-member",
  ])(
    "%s with a bare member row as the returned value emits nothing and logs no skip",
    async (path) => {
      const results = await runAfter({
        path,
        returned: {
          id: "mem-1",
          organizationId: "org-member",
          userId: "user-member",
          role: "admin",
        },
        session: SESSION,
      });

      expect(emitEvent).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(results).toEqual([undefined]);
    },
  );
});
