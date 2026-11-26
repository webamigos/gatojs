import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_EVENT_PATHS,
  organizationEvents,
} from "../organization-events";

const SIX_PATHS = [
  "/organization/create",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/accept-invitation",
  "/organization/update-member-role",
  "/organization/remove-member",
] as const;

const createdOrganization = {
  id: "org-created",
  name: "Acme",
  slug: "acme-1234",
  logo: null,
  metadata: null,
  createdAt: new Date("2026-11-26T00:00:00.000Z"),
  members: [
    {
      id: "mem-owner",
      organizationId: "org-created",
      userId: "user-owner",
      role: "owner",
    },
    {
      id: "mem-second",
      organizationId: "org-created",
      userId: "user-second",
      role: "member",
    },
  ],
};

const invitation = {
  id: "inv-1",
  organizationId: "org-invitation",
  email: "nowy@a.example",
  role: "admin",
  status: "pending",
  inviterId: "user-inviter",
  expiresAt: new Date("2026-11-28T00:00:00.000Z"),
};

const member = {
  id: "mem-1",
  organizationId: "org-member",
  userId: "user-member",
  role: "admin",
  createdAt: new Date("2026-11-26T00:00:00.000Z"),
};

describe("ORGANIZATION_EVENT_PATHS", () => {
  it("holds exactly the six organization paths that emit core events", () => {
    expect([...ORGANIZATION_EVENT_PATHS].sort()).toEqual([
      "/organization/accept-invitation",
      "/organization/cancel-invitation",
      "/organization/create",
      "/organization/invite-member",
      "/organization/remove-member",
      "/organization/update-member-role",
    ]);
  });

  it.each([
    "/organization/update",
    "/organization/delete",
    "/organization/leave",
    "/organization/set-active",
    "/organization/reject-invitation",
    "/sign-up/email",
  ])("does not hold %s", (path) => {
    expect(ORGANIZATION_EVENT_PATHS.has(path)).toBe(false);
  });
});

describe("organizationEvents: /organization/create", () => {
  it("emits organizations.created for the new organization with the first member as owner", () => {
    expect(
      organizationEvents({
        path: "/organization/create",
        actorUserId: "user-actor",
        returned: createdOrganization,
      }),
    ).toStrictEqual([
      {
        origin: { organizationId: "org-created", actorUserId: "user-actor" },
        name: "organizations.created",
        payload: {
          name: "Acme",
          slug: "acme-1234",
          ownerUserId: "user-owner",
        },
      },
    ]);
  });

  it("keeps a null actor", () => {
    expect(
      organizationEvents({
        path: "/organization/create",
        actorUserId: null,
        returned: createdOrganization,
      }),
    ).toStrictEqual([
      {
        origin: { organizationId: "org-created", actorUserId: null },
        name: "organizations.created",
        payload: {
          name: "Acme",
          slug: "acme-1234",
          ownerUserId: "user-owner",
        },
      },
    ]);
  });

  it.each([
    ["no id", { ...createdOrganization, id: undefined }],
    ["a numeric id", { ...createdOrganization, id: 7 }],
    ["no name", { ...createdOrganization, name: undefined }],
    ["a numeric name", { ...createdOrganization, name: 7 }],
    ["no slug", { ...createdOrganization, slug: undefined }],
    ["a null slug", { ...createdOrganization, slug: null }],
    ["no members", { ...createdOrganization, members: undefined }],
    ["an empty members list", { ...createdOrganization, members: [] }],
    [
      "members as an object",
      { ...createdOrganization, members: { userId: "user-owner" } },
    ],
    [
      "a first member without userId",
      { ...createdOrganization, members: [{ id: "mem-owner", role: "owner" }] },
    ],
    [
      "a first member with a numeric userId",
      { ...createdOrganization, members: [{ id: "mem-owner", userId: 7 }] },
    ],
    ["a null first member", { ...createdOrganization, members: [null] }],
  ])("returns [] for a returned organization with %s", (_label, returned) => {
    expect(
      organizationEvents({
        path: "/organization/create",
        actorUserId: "user-actor",
        returned,
      }),
    ).toEqual([]);
  });
});

describe("organizationEvents: /organization/invite-member", () => {
  it("emits users.invited with the invitation id, email and role in the invitation's organization", () => {
    expect(
      organizationEvents({
        path: "/organization/invite-member",
        actorUserId: "user-inviter",
        returned: invitation,
      }),
    ).toStrictEqual([
      {
        origin: {
          organizationId: "org-invitation",
          actorUserId: "user-inviter",
        },
        name: "users.invited",
        payload: {
          invitationId: "inv-1",
          email: "nowy@a.example",
          role: "admin",
        },
      },
    ]);
  });

  it("passes a role outside the organization roles through unchanged", () => {
    const events = organizationEvents({
      path: "/organization/invite-member",
      actorUserId: "user-inviter",
      returned: { ...invitation, role: "boss" },
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      invitationId: "inv-1",
      email: "nowy@a.example",
      role: "boss",
    });
  });

  it.each([
    ["no id", { ...invitation, id: undefined }],
    ["no organizationId", { ...invitation, organizationId: undefined }],
    ["no email", { ...invitation, email: undefined }],
    ["no role", { ...invitation, role: undefined }],
    ["a numeric organizationId", { ...invitation, organizationId: 1 }],
    ["a null email", { ...invitation, email: null }],
    ["a numeric role", { ...invitation, role: 2 }],
  ])("returns [] for a returned invitation with %s", (_label, returned) => {
    expect(
      organizationEvents({
        path: "/organization/invite-member",
        actorUserId: "user-inviter",
        returned,
      }),
    ).toEqual([]);
  });
});

describe("organizationEvents: /organization/cancel-invitation", () => {
  it("emits users.invitation-canceled with the invitation id in the invitation's organization", () => {
    expect(
      organizationEvents({
        path: "/organization/cancel-invitation",
        actorUserId: "user-inviter",
        returned: { ...invitation, status: "canceled" },
      }),
    ).toStrictEqual([
      {
        origin: {
          organizationId: "org-invitation",
          actorUserId: "user-inviter",
        },
        name: "users.invitation-canceled",
        payload: { invitationId: "inv-1" },
      },
    ]);
  });

  it.each([
    ["no id", { ...invitation, id: undefined }],
    ["no organizationId", { ...invitation, organizationId: undefined }],
    ["a numeric id", { ...invitation, id: 1 }],
  ])("returns [] for a returned invitation with %s", (_label, returned) => {
    expect(
      organizationEvents({
        path: "/organization/cancel-invitation",
        actorUserId: "user-inviter",
        returned,
      }),
    ).toEqual([]);
  });
});

describe("organizationEvents: /organization/accept-invitation", () => {
  it("emits users.invitation-accepted then organizations.member-added, each with the organization of its own row", () => {
    expect(
      organizationEvents({
        path: "/organization/accept-invitation",
        actorUserId: "user-member",
        returned: {
          invitation: { ...invitation, status: "accepted" },
          member,
        },
      }),
    ).toStrictEqual([
      {
        origin: {
          organizationId: "org-invitation",
          actorUserId: "user-member",
        },
        name: "users.invitation-accepted",
        payload: { invitationId: "inv-1", userId: "user-member" },
      },
      {
        origin: { organizationId: "org-member", actorUserId: "user-member" },
        name: "organizations.member-added",
        payload: { memberId: "mem-1", userId: "user-member", role: "admin" },
      },
    ]);
  });

  it("takes userId from the member, not from the actor", () => {
    const events = organizationEvents({
      path: "/organization/accept-invitation",
      actorUserId: "user-someone-else",
      returned: { invitation, member },
    });

    expect(events.map((event) => event.payload)).toEqual([
      { invitationId: "inv-1", userId: "user-member" },
      { memberId: "mem-1", userId: "user-member", role: "admin" },
    ]);
  });

  it.each([
    ["a null member", { invitation, member: null }],
    ["no member", { invitation }],
    ["no invitation", { member }],
    [
      "a member without id",
      { invitation, member: { ...member, id: undefined } },
    ],
    [
      "a member without organizationId",
      { invitation, member: { ...member, organizationId: undefined } },
    ],
    [
      "a member without userId",
      { invitation, member: { ...member, userId: undefined } },
    ],
    [
      "a member without role",
      { invitation, member: { ...member, role: undefined } },
    ],
    [
      "a member with a numeric userId",
      { invitation, member: { ...member, userId: 3 } },
    ],
    [
      "an invitation without id",
      { invitation: { ...invitation, id: undefined }, member },
    ],
    [
      "an invitation without organizationId",
      { invitation: { ...invitation, organizationId: undefined }, member },
    ],
    ["the member at the top level", member],
  ])("returns [] (both or none) for %s", (_label, returned) => {
    expect(
      organizationEvents({
        path: "/organization/accept-invitation",
        actorUserId: "user-member",
        returned,
      }),
    ).toEqual([]);
  });
});

describe("organizationEvents: /organization/update-member-role", () => {
  it("emits organizations.member-role-changed with the previous role when it belongs to the returned member", () => {
    expect(
      organizationEvents({
        path: "/organization/update-member-role",
        actorUserId: "user-owner",
        returned: member,
        previousRole: { memberId: "mem-1", role: "member" },
      }),
    ).toStrictEqual([
      {
        origin: { organizationId: "org-member", actorUserId: "user-owner" },
        name: "organizations.member-role-changed",
        payload: {
          memberId: "mem-1",
          userId: "user-member",
          previousRole: "member",
          role: "admin",
        },
      },
    ]);
  });

  it("returns [] without a previous role", () => {
    expect(
      organizationEvents({
        path: "/organization/update-member-role",
        actorUserId: "user-owner",
        returned: member,
      }),
    ).toEqual([]);
  });

  it("returns [] when the previous role belongs to another member", () => {
    expect(
      organizationEvents({
        path: "/organization/update-member-role",
        actorUserId: "user-owner",
        returned: member,
        previousRole: { memberId: "mem-other", role: "member" },
      }),
    ).toEqual([]);
  });

  it.each([
    ["no id", { ...member, id: undefined }],
    ["no organizationId", { ...member, organizationId: undefined }],
    ["no userId", { ...member, userId: undefined }],
    ["no role", { ...member, role: undefined }],
    ["a numeric role", { ...member, role: 1 }],
    ["the member wrapped in { member }", { member }],
  ])("returns [] for a returned member with %s", (_label, returned) => {
    expect(
      organizationEvents({
        path: "/organization/update-member-role",
        actorUserId: "user-owner",
        returned,
        previousRole: { memberId: "mem-1", role: "member" },
      }),
    ).toEqual([]);
  });
});

describe("organizationEvents: /organization/remove-member", () => {
  it("emits organizations.member-removed with the removed member's id, user and role", () => {
    expect(
      organizationEvents({
        path: "/organization/remove-member",
        actorUserId: "user-owner",
        returned: { member },
      }),
    ).toStrictEqual([
      {
        origin: { organizationId: "org-member", actorUserId: "user-owner" },
        name: "organizations.member-removed",
        payload: { memberId: "mem-1", userId: "user-member", role: "admin" },
      },
    ]);
  });

  it.each([
    ["the member at the top level", member],
    ["a null member", { member: null }],
    ["a member without id", { member: { ...member, id: undefined } }],
    [
      "a member without organizationId",
      { member: { ...member, organizationId: undefined } },
    ],
    ["a member without userId", { member: { ...member, userId: undefined } }],
    ["a member without role", { member: { ...member, role: undefined } }],
    ["a member with a numeric id", { member: { ...member, id: 9 } }],
  ])("returns [] for %s", (_label, returned) => {
    expect(
      organizationEvents({
        path: "/organization/remove-member",
        actorUserId: "user-owner",
        returned,
      }),
    ).toEqual([]);
  });
});

describe("organizationEvents: failed calls and other paths", () => {
  it.each(SIX_PATHS)(
    "%s returns [] for undefined, null, an error body, an Error and a string",
    (path) => {
      for (const returned of [
        undefined,
        null,
        { message: "boom", status: 400 },
        { error: { message: "boom" } },
        new Error("FORBIDDEN"),
        "ok",
        42,
      ]) {
        expect(
          organizationEvents({
            path,
            actorUserId: "user-owner",
            returned,
            previousRole: { memberId: "mem-1", role: "member" },
          }),
        ).toEqual([]);
      }
    },
  );

  it.each([
    "/organization/set-active",
    "/organization/update",
    "/organization/leave",
    "/organization/reject-invitation",
  ])("%s returns [] even for a well-formed row", (path) => {
    for (const returned of [invitation, member, { invitation, member }]) {
      expect(
        organizationEvents({
          path,
          actorUserId: "user-owner",
          returned,
          previousRole: { memberId: "mem-1", role: "member" },
        }),
      ).toEqual([]);
    }
  });
});

describe("organizationEvents: invariants", () => {
  test.prop([
    fc
      .string()
      .filter((path) => !(SIX_PATHS as readonly string[]).includes(path)),
    fc.anything(),
  ])("a path outside the six never emits", (path, returned) => {
    expect(
      organizationEvents({
        path,
        actorUserId: "user-owner",
        returned,
        previousRole: { memberId: "mem-1", role: "member" },
      }),
    ).toEqual([]);
  });

  test.prop([
    fc.constantFrom(...SIX_PATHS),
    fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
    ),
  ])("a primitive returned value never emits", (path, returned) => {
    expect(
      organizationEvents({
        path,
        actorUserId: "user-owner",
        returned,
        previousRole: { memberId: "mem-1", role: "member" },
      }),
    ).toEqual([]);
  });

  test.prop([
    fc.record({
      id: fc.string(),
      organizationId: fc.string(),
      email: fc.string(),
      role: fc.string(),
    }),
    fc.option(fc.string(), { nil: null }),
  ])(
    "an invitation always emits in its own organization with its own fields",
    (row, actorUserId) => {
      expect(
        organizationEvents({
          path: "/organization/invite-member",
          actorUserId,
          returned: row,
        }),
      ).toStrictEqual([
        {
          origin: { organizationId: row.organizationId, actorUserId },
          name: "users.invited",
          payload: { invitationId: row.id, email: row.email, role: row.role },
        },
      ]);
    },
  );

  test.prop([
    fc.record({
      id: fc.string(),
      organizationId: fc.string(),
      userId: fc.string(),
      role: fc.string(),
    }),
  ])("a removed member always emits in the member's organization", (row) => {
    const events = organizationEvents({
      path: "/organization/remove-member",
      actorUserId: "user-owner",
      returned: { member: row },
    });

    expect(events).toHaveLength(1);
    expect(events[0].origin.organizationId).toBe(row.organizationId);
  });
});
