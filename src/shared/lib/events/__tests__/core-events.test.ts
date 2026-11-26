import { describe, expect, it } from "vitest";
import { coreEvents } from "../core-events";

function accepts(name: keyof typeof coreEvents, payload: unknown): boolean {
  return coreEvents[name].safeParse(payload).success;
}

describe("coreEvents", () => {
  it("declares exactly the eight core events", () => {
    expect(Object.keys(coreEvents).sort()).toEqual([
      "auth.signed-up",
      "organizations.created",
      "organizations.member-added",
      "organizations.member-removed",
      "organizations.member-role-changed",
      "users.invitation-accepted",
      "users.invitation-canceled",
      "users.invited",
    ]);
  });

  it("no core schema declares organizationId", () => {
    for (const schema of Object.values(coreEvents)) {
      expect(Object.keys(schema.shape)).not.toContain("organizationId");
    }
  });

  describe("organizations.created", () => {
    it("accepts name, slug and ownerUserId", () => {
      expect(
        accepts("organizations.created", {
          name: "Acme",
          slug: "acme",
          ownerUserId: "u1",
        }),
      ).toBe(true);
    });

    it("rejects a payload without ownerUserId", () => {
      expect(
        accepts("organizations.created", { name: "Acme", slug: "acme" }),
      ).toBe(false);
    });

    it("rejects a numeric name", () => {
      expect(
        accepts("organizations.created", {
          name: 1,
          slug: "acme",
          ownerUserId: "u1",
        }),
      ).toBe(false);
    });

    it("declares exactly name, slug and ownerUserId", () => {
      expect(
        Object.keys(coreEvents["organizations.created"].shape).sort(),
      ).toEqual(["name", "ownerUserId", "slug"]);
    });
  });

  describe("organizations.member-added", () => {
    it.each(["owner", "admin", "member"])("accepts the role %s", (role) => {
      expect(
        accepts("organizations.member-added", {
          memberId: "m1",
          userId: "u2",
          role,
        }),
      ).toBe(true);
    });

    it("rejects a role outside owner, admin, member", () => {
      expect(
        accepts("organizations.member-added", {
          memberId: "m1",
          userId: "u2",
          role: "superadmin",
        }),
      ).toBe(false);
    });

    it("rejects a payload without memberId", () => {
      expect(
        accepts("organizations.member-added", { userId: "u2", role: "member" }),
      ).toBe(false);
    });
  });

  describe("organizations.member-removed", () => {
    it("accepts memberId and userId", () => {
      expect(
        accepts("organizations.member-removed", {
          memberId: "m1",
          userId: "u2",
        }),
      ).toBe(true);
    });

    it("rejects a payload without userId", () => {
      expect(accepts("organizations.member-removed", { memberId: "m1" })).toBe(
        false,
      );
    });
  });

  describe("organizations.member-role-changed", () => {
    it("accepts previousRole member and role admin", () => {
      expect(
        accepts("organizations.member-role-changed", {
          memberId: "m1",
          userId: "u2",
          previousRole: "member",
          role: "admin",
        }),
      ).toBe(true);
    });

    it("rejects a previousRole outside the organization roles", () => {
      expect(
        accepts("organizations.member-role-changed", {
          memberId: "m1",
          userId: "u2",
          previousRole: "guest",
          role: "admin",
        }),
      ).toBe(false);
    });

    it("rejects a payload without previousRole", () => {
      expect(
        accepts("organizations.member-role-changed", {
          memberId: "m1",
          userId: "u2",
          role: "admin",
        }),
      ).toBe(false);
    });
  });

  describe("users.invited", () => {
    it("accepts invitationId, email and role", () => {
      expect(
        accepts("users.invited", {
          invitationId: "i1",
          email: "a@b.c",
          role: "member",
        }),
      ).toBe(true);
    });

    it("rejects the role boss", () => {
      expect(
        accepts("users.invited", {
          invitationId: "i1",
          email: "a@b.c",
          role: "boss",
        }),
      ).toBe(false);
    });

    it("rejects a payload without email", () => {
      expect(
        accepts("users.invited", { invitationId: "i1", role: "member" }),
      ).toBe(false);
    });
  });

  describe("users.invitation-accepted", () => {
    it("accepts invitationId and userId", () => {
      expect(
        accepts("users.invitation-accepted", {
          invitationId: "i1",
          userId: "u2",
        }),
      ).toBe(true);
    });

    it("rejects a payload without userId", () => {
      expect(accepts("users.invitation-accepted", { invitationId: "i1" })).toBe(
        false,
      );
    });
  });

  describe("users.invitation-canceled", () => {
    it("accepts invitationId", () => {
      expect(accepts("users.invitation-canceled", { invitationId: "i1" })).toBe(
        true,
      );
    });

    it("rejects an empty payload", () => {
      expect(accepts("users.invitation-canceled", {})).toBe(false);
    });
  });

  describe("auth.signed-up", () => {
    it("accepts userId and email", () => {
      expect(accepts("auth.signed-up", { userId: "u1", email: "a@b.c" })).toBe(
        true,
      );
    });

    it("rejects a payload without email", () => {
      expect(accepts("auth.signed-up", { userId: "u1" })).toBe(false);
    });
  });
});
