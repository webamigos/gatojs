import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { signupEvents } from "../signup-events";

const ORIGIN_A = { organizationId: "org-a", actorUserId: "u1" };

describe("signupEvents", () => {
  it("join z zaproszeniem daje auth.signed-up, users.invitation-accepted i organizations.member-added w tej kolejności", () => {
    expect(
      signupEvents({
        userId: "u1",
        email: "a@x.pl",
        membership: {
          action: "join",
          organizationId: "org-a",
          role: "admin",
          invitationId: "inv-1",
        },
        applied: { organizationId: "org-a", memberId: "m1" },
      }),
    ).toEqual([
      {
        origin: ORIGIN_A,
        name: "auth.signed-up",
        payload: { userId: "u1", email: "a@x.pl" },
      },
      {
        origin: ORIGIN_A,
        name: "users.invitation-accepted",
        payload: { invitationId: "inv-1", userId: "u1" },
      },
      {
        origin: ORIGIN_A,
        name: "organizations.member-added",
        payload: { memberId: "m1", userId: "u1", role: "admin" },
      },
    ]);
  });

  it("join bez zaproszenia daje auth.signed-up i organizations.member-added z rolą member, bez users.invitation-accepted", () => {
    expect(
      signupEvents({
        userId: "u1",
        email: "a@x.pl",
        membership: { action: "join", organizationId: "org-a", role: "member" },
        applied: { organizationId: "org-a", memberId: "m1" },
      }),
    ).toEqual([
      {
        origin: ORIGIN_A,
        name: "auth.signed-up",
        payload: { userId: "u1", email: "a@x.pl" },
      },
      {
        origin: ORIGIN_A,
        name: "organizations.member-added",
        payload: { memberId: "m1", userId: "u1", role: "member" },
      },
    ]);
  });

  it("create daje wyłącznie auth.signed-up dla nowej organizacji", () => {
    expect(
      signupEvents({
        userId: "u1",
        email: "a@x.pl",
        membership: {
          action: "create",
          organizationName: "Ala — organizacja",
          role: "owner",
        },
        applied: { organizationId: "org-new", memberId: null },
      }),
    ).toEqual([
      {
        origin: { organizationId: "org-new", actorUserId: "u1" },
        name: "auth.signed-up",
        payload: { userId: "u1", email: "a@x.pl" },
      },
    ]);
  });

  it("join z zaproszeniem bez memberId daje wyłącznie auth.signed-up", () => {
    expect(
      signupEvents({
        userId: "u1",
        email: "a@x.pl",
        membership: {
          action: "join",
          organizationId: "org-a",
          role: "admin",
          invitationId: "inv-1",
        },
        applied: { organizationId: "org-a", memberId: null },
      }),
    ).toEqual([
      {
        origin: ORIGIN_A,
        name: "auth.signed-up",
        payload: { userId: "u1", email: "a@x.pl" },
      },
    ]);
  });

  it("join bez zaproszenia i bez memberId daje wyłącznie auth.signed-up", () => {
    expect(
      signupEvents({
        userId: "u1",
        email: "a@x.pl",
        membership: { action: "join", organizationId: "org-a", role: "member" },
        applied: { organizationId: "org-a", memberId: null },
      }).map((event) => event.name),
    ).toEqual(["auth.signed-up"]);
  });

  it("organizacja zdarzeń pochodzi z applied, a nie z innego pola", () => {
    const events = signupEvents({
      userId: "u1",
      email: "a@x.pl",
      membership: {
        action: "join",
        organizationId: "org-a",
        role: "member",
        invitationId: "inv-1",
      },
      applied: { organizationId: "org-a", memberId: "m1" },
    });

    expect(events.map((event) => event.origin.organizationId)).toEqual([
      "org-a",
      "org-a",
      "org-a",
    ]);
    expect(events.map((event) => event.origin.actorUserId)).toEqual([
      "u1",
      "u1",
      "u1",
    ]);
  });

  it("memberId w organizations.member-added to id członka, nie id użytkownika ani zaproszenia", () => {
    const events = signupEvents({
      userId: "user-7",
      email: "b@x.pl",
      membership: {
        action: "join",
        organizationId: "org-b",
        role: "owner",
        invitationId: "inv-7",
      },
      applied: { organizationId: "org-b", memberId: "mem-7" },
    });

    expect(events[2]).toEqual({
      origin: { organizationId: "org-b", actorUserId: "user-7" },
      name: "organizations.member-added",
      payload: { memberId: "mem-7", userId: "user-7", role: "owner" },
    });
    expect(events[1]).toEqual({
      origin: { organizationId: "org-b", actorUserId: "user-7" },
      name: "users.invitation-accepted",
      payload: { invitationId: "inv-7", userId: "user-7" },
    });
  });

  test.prop([
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.constantFrom("owner" as const, "admin" as const, "member" as const),
  ])(
    "join z zaproszeniem i memberId zawsze daje trzy zdarzenia z danymi wejścia i jednym originem",
    (userId, email, organizationId, memberId, invitationId, role) => {
      const origin = { organizationId, actorUserId: userId };

      expect(
        signupEvents({
          userId,
          email,
          membership: { action: "join", organizationId, role, invitationId },
          applied: { organizationId, memberId },
        }),
      ).toEqual([
        { origin, name: "auth.signed-up", payload: { userId, email } },
        {
          origin,
          name: "users.invitation-accepted",
          payload: { invitationId, userId },
        },
        {
          origin,
          name: "organizations.member-added",
          payload: { memberId, userId, role },
        },
      ]);
    },
  );

  test.prop([
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
  ])(
    "create nigdy nie daje organizations.member-added ani users.invitation-accepted",
    (userId, email, organizationId) => {
      expect(
        signupEvents({
          userId,
          email,
          membership: {
            action: "create",
            organizationName: "Org",
            role: "owner",
          },
          applied: { organizationId, memberId: null },
        }),
      ).toEqual([
        {
          origin: { organizationId, actorUserId: userId },
          name: "auth.signed-up",
          payload: { userId, email },
        },
      ]);
    },
  );
});
