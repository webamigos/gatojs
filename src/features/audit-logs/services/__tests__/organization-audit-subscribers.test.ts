import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackAudit } = vi.hoisted(() => ({ trackAudit: vi.fn() }));

vi.mock("@/shared/lib/audit", () => ({ trackAudit }));

import { organizationAuditSubscribers } from "../organization-audit-subscribers";

interface Subscriber {
  id: string;
  run: (event: unknown) => Promise<void> | void;
}

function subscribersOf(name: string): Subscriber[] {
  const entry = (organizationAuditSubscribers as Record<string, unknown>)[name];
  if (entry === undefined) {
    return [];
  }
  return (Array.isArray(entry) ? entry : [entry]) as Subscriber[];
}

function onlySubscriberOf(name: string): Subscriber {
  const subscribers = subscribersOf(name);
  expect(subscribers).toHaveLength(1);
  return subscribers[0];
}

function event(name: string, payload: unknown, serviceMode: boolean) {
  return Object.freeze({
    name,
    organizationId: "org-a",
    actorUserId: "user-actor",
    serviceMode,
    payload: Object.freeze(payload),
  });
}

function onlyAuditEntry(): unknown {
  expect(trackAudit).toHaveBeenCalledTimes(1);
  return trackAudit.mock.calls[0][0];
}

beforeEach(() => {
  trackAudit.mockReset();
  trackAudit.mockResolvedValue(undefined);
});

describe("organizationAuditSubscribers: subscriptions", () => {
  it("subscribes to exactly the five organization events", () => {
    expect(Object.keys(organizationAuditSubscribers).sort()).toEqual([
      "organizations.member-removed",
      "organizations.member-role-changed",
      "users.invitation-accepted",
      "users.invitation-canceled",
      "users.invited",
    ]);
  });

  it.each([
    ["users.invited", "audit-logs.member-invited"],
    ["users.invitation-canceled", "audit-logs.invitation-canceled"],
    ["users.invitation-accepted", "audit-logs.invitation-accepted"],
    ["organizations.member-role-changed", "audit-logs.member-role-changed"],
    ["organizations.member-removed", "audit-logs.member-removed"],
  ])("%s has one subscriber with the id %s", (name, id) => {
    expect(onlySubscriberOf(name).id).toBe(id);
  });

  it.each([
    "organizations.created",
    "organizations.member-added",
    "auth.signed-up",
  ])("does not subscribe to %s", (name) => {
    expect(subscribersOf(name)).toEqual([]);
  });

  it("the module's subscribers.ts exports the same map", async () => {
    const { subscribers } = await import("@/features/audit-logs/subscribers");
    expect(subscribers).toBe(organizationAuditSubscribers);
  });
});

describe.each([false, true])(
  "organizationAuditSubscribers: audit entries with serviceMode %s",
  (serviceMode) => {
    it("users.invited writes member.invited with the email and role in newData", async () => {
      await onlySubscriberOf("users.invited").run(
        event(
          "users.invited",
          { invitationId: "inv-1", email: "nowy@a.example", role: "member" },
          serviceMode,
        ),
      );

      expect(onlyAuditEntry()).toEqual({
        organizationId: "org-a",
        actorUserId: "user-actor",
        serviceMode,
        action: "member.invited",
        entityType: "invitation",
        entityId: "inv-1",
        newData: { email: "nowy@a.example", role: "member" },
      });
    });

    it("users.invitation-canceled writes invitation.canceled", async () => {
      await onlySubscriberOf("users.invitation-canceled").run(
        event(
          "users.invitation-canceled",
          { invitationId: "inv-2" },
          serviceMode,
        ),
      );

      expect(onlyAuditEntry()).toEqual({
        organizationId: "org-a",
        actorUserId: "user-actor",
        serviceMode,
        action: "invitation.canceled",
        entityType: "invitation",
        entityId: "inv-2",
      });
    });

    it("users.invitation-accepted writes invitation.accepted", async () => {
      await onlySubscriberOf("users.invitation-accepted").run(
        event(
          "users.invitation-accepted",
          { invitationId: "inv-3", userId: "user-member" },
          serviceMode,
        ),
      );

      expect(onlyAuditEntry()).toEqual({
        organizationId: "org-a",
        actorUserId: "user-actor",
        serviceMode,
        action: "invitation.accepted",
        entityType: "invitation",
        entityId: "inv-3",
      });
    });

    it("organizations.member-role-changed writes member.role_changed with the previous and the new role", async () => {
      await onlySubscriberOf("organizations.member-role-changed").run(
        event(
          "organizations.member-role-changed",
          {
            memberId: "mem-1",
            userId: "user-member",
            previousRole: "member",
            role: "admin",
          },
          serviceMode,
        ),
      );

      expect(onlyAuditEntry()).toEqual({
        organizationId: "org-a",
        actorUserId: "user-actor",
        serviceMode,
        action: "member.role_changed",
        entityType: "member",
        entityId: "mem-1",
        oldData: { role: "member" },
        newData: { role: "admin" },
      });
    });

    it("organizations.member-removed writes member.removed with the user and role in oldData", async () => {
      await onlySubscriberOf("organizations.member-removed").run(
        event(
          "organizations.member-removed",
          { memberId: "mem-2", userId: "user-gone", role: "owner" },
          serviceMode,
        ),
      );

      expect(onlyAuditEntry()).toEqual({
        organizationId: "org-a",
        actorUserId: "user-actor",
        serviceMode,
        action: "member.removed",
        entityType: "member",
        entityId: "mem-2",
        oldData: { userId: "user-gone", role: "owner" },
      });
    });
  },
);

describe("organizationAuditSubscribers: origin of the entry", () => {
  it("takes the organization and a null actor from the event", async () => {
    await onlySubscriberOf("users.invitation-canceled").run(
      Object.freeze({
        name: "users.invitation-canceled",
        organizationId: "org-z",
        actorUserId: null,
        serviceMode: false,
        payload: Object.freeze({ invitationId: "inv-9" }),
      }),
    );

    expect(onlyAuditEntry()).toEqual({
      organizationId: "org-z",
      actorUserId: null,
      serviceMode: false,
      action: "invitation.canceled",
      entityType: "invitation",
      entityId: "inv-9",
    });
  });

  it("the subscriber settles only after trackAudit settled", async () => {
    let release: () => void = () => undefined;
    trackAudit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let settled = false;

    const running = Promise.resolve(
      onlySubscriberOf("users.invited").run(
        event(
          "users.invited",
          { invitationId: "inv-1", email: "nowy@a.example", role: "member" },
          false,
        ),
      ),
    ).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(settled).toBe(false);
    release();
    await running;
    expect(settled).toBe(true);
  });
});

describe("generated registry with audit-logs", () => {
  it("audit-logs has no better-auth plugin any more", async () => {
    const { authPlugins } = await import("@/modules.generated");

    expect(
      authPlugins.map((plugin: { id: string }) => plugin.id),
    ).not.toContain("audit-logs");
  });

  it("audit-logs subscribes through moduleSubscribers when the module is enabled", async () => {
    const { modules, moduleSubscribers } = await import("@/modules.generated");
    const enabled = modules.some((moduleDef) => moduleDef.key === "audit-logs");

    expect(
      moduleSubscribers.filter(
        (entry: { module: string }) => entry.module === "audit-logs",
      ),
    ).toEqual(
      enabled
        ? [{ module: "audit-logs", value: organizationAuditSubscribers }]
        : [],
    );
  });
});
