import { describe, expect, it } from "vitest";
import { organizationAuditEvent } from "../organization-audit-events";

const invitation = {
  id: "inv-1",
  organizationId: "org-a",
  email: "nowy@a.example",
  role: "member",
  status: "pending",
  inviterId: "user-owner",
};

const member = {
  id: "mem-1",
  organizationId: "org-a",
  userId: "user-member",
  role: "admin",
};

describe("organizationAuditEvent", () => {
  it("zaproszenie zapisuje member.invited z id zaproszenia, e-mailem i rola w newData", () => {
    expect(
      organizationAuditEvent({
        path: "/organization/invite-member",
        actorUserId: "user-owner",
        body: { email: "Nowy@a.example", role: "member" },
        returned: invitation,
      }),
    ).toEqual({
      organizationId: "org-a",
      actorUserId: "user-owner",
      action: "member.invited",
      entityType: "invitation",
      entityId: "inv-1",
      newData: { email: "nowy@a.example", role: "member" },
    });
  });

  it("organizacja zaproszenia pochodzi z odpowiedzi, nie z ciała", () => {
    const event = organizationAuditEvent({
      path: "/organization/invite-member",
      actorUserId: "user-owner",
      body: {
        email: "nowy@a.example",
        role: "member",
        organizationId: "org-x",
      },
      returned: invitation,
    });
    expect(event?.organizationId).toBe("org-a");
  });

  it("anulowanie zaproszenia zapisuje invitation.canceled z id zaproszenia", () => {
    expect(
      organizationAuditEvent({
        path: "/organization/cancel-invitation",
        actorUserId: "user-owner",
        body: { invitationId: "inv-1" },
        returned: { ...invitation, status: "canceled" },
      }),
    ).toEqual({
      organizationId: "org-a",
      actorUserId: "user-owner",
      action: "invitation.canceled",
      entityType: "invitation",
      entityId: "inv-1",
    });
  });

  it("przyjęcie zaproszenia zapisuje invitation.accepted z aktorem przyjmującym i organizacją z odpowiedzi", () => {
    expect(
      organizationAuditEvent({
        path: "/organization/accept-invitation",
        actorUserId: "user-member",
        body: { invitationId: "inv-1" },
        returned: {
          invitation: { ...invitation, status: "accepted" },
          member,
        },
      }),
    ).toEqual({
      organizationId: "org-a",
      actorUserId: "user-member",
      action: "invitation.accepted",
      entityType: "invitation",
      entityId: "inv-1",
    });
  });

  it("zmiana roli zapisuje poprzednią rolę w oldData i nową w newData", () => {
    expect(
      organizationAuditEvent({
        path: "/organization/update-member-role",
        actorUserId: "user-owner",
        body: { memberId: "mem-1", role: "admin" },
        returned: member,
        previousRole: "member",
      }),
    ).toEqual({
      organizationId: "org-a",
      actorUserId: "user-owner",
      action: "member.role_changed",
      entityType: "member",
      entityId: "mem-1",
      oldData: { role: "member" },
      newData: { role: "admin" },
    });
  });

  it("zmiana roli bez znanej poprzedniej roli nie wymyśla oldData.role", () => {
    const event = organizationAuditEvent({
      path: "/organization/update-member-role",
      actorUserId: "user-owner",
      body: { memberId: "mem-1", role: "admin" },
      returned: member,
    });
    expect(event?.action).toBe("member.role_changed");
    expect(event?.oldData).not.toEqual({ role: "admin" });
  });

  it("usunięcie członka zapisuje member.removed z userId i rolą w oldData", () => {
    expect(
      organizationAuditEvent({
        path: "/organization/remove-member",
        actorUserId: "user-owner",
        body: { memberIdOrEmail: "mem-1" },
        returned: { member },
      }),
    ).toEqual({
      organizationId: "org-a",
      actorUserId: "user-owner",
      action: "member.removed",
      entityType: "member",
      entityId: "mem-1",
      oldData: { userId: "user-member", role: "admin" },
    });
  });

  it("zwraca null dla ścieżki spoza listy", () => {
    expect(
      organizationAuditEvent({
        path: "/organization/set-active",
        actorUserId: "user-owner",
        body: {},
        returned: invitation,
      }),
    ).toBeNull();
  });

  it.each([
    "/organization/invite-member",
    "/organization/cancel-invitation",
    "/organization/accept-invitation",
    "/organization/update-member-role",
    "/organization/remove-member",
  ])("%s bez odpowiedzi albo z odpowiedzią błędu zwraca null", (path) => {
    for (const returned of [
      undefined,
      null,
      { message: "boom", status: 400 },
      { error: { message: "boom" } },
    ]) {
      expect(
        organizationAuditEvent({
          path,
          actorUserId: "user-owner",
          body: { email: "a@a.example", role: "member" },
          returned,
        }),
      ).toBeNull();
    }
  });

  it("zwraca null, gdy odpowiedź jest instancją błędu", () => {
    expect(
      organizationAuditEvent({
        path: "/organization/remove-member",
        actorUserId: "user-owner",
        body: { memberIdOrEmail: "mem-1" },
        returned: new Error("FORBIDDEN"),
      }),
    ).toBeNull();
  });

  it("zachowuje null jako aktora", () => {
    const event = organizationAuditEvent({
      path: "/organization/cancel-invitation",
      actorUserId: null,
      body: { invitationId: "inv-1" },
      returned: invitation,
    });
    expect(event?.actorUserId).toBeNull();
  });
});
