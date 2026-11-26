import { trackAudit, type AuditEvent } from "@/shared/lib/audit";
import {
  defineSubscribers,
  type DomainEvent,
} from "@/shared/lib/events/define-events";

function auditOrigin(
  event: DomainEvent,
): Pick<AuditEvent, "organizationId" | "actorUserId" | "serviceMode"> {
  return {
    organizationId: event.organizationId,
    actorUserId: event.actorUserId,
    serviceMode: event.serviceMode,
  };
}

export const organizationAuditSubscribers = defineSubscribers({
  "users.invited": {
    id: "audit-logs.member-invited",
    run: async (event) => {
      await trackAudit({
        ...auditOrigin(event),
        action: "member.invited",
        entityType: "invitation",
        entityId: event.payload.invitationId,
        newData: { email: event.payload.email, role: event.payload.role },
      });
    },
  },
  "users.invitation-canceled": {
    id: "audit-logs.invitation-canceled",
    run: async (event) => {
      await trackAudit({
        ...auditOrigin(event),
        action: "invitation.canceled",
        entityType: "invitation",
        entityId: event.payload.invitationId,
      });
    },
  },
  "users.invitation-accepted": {
    id: "audit-logs.invitation-accepted",
    run: async (event) => {
      await trackAudit({
        ...auditOrigin(event),
        action: "invitation.accepted",
        entityType: "invitation",
        entityId: event.payload.invitationId,
      });
    },
  },
  "organizations.member-role-changed": {
    id: "audit-logs.member-role-changed",
    run: async (event) => {
      await trackAudit({
        ...auditOrigin(event),
        action: "member.role_changed",
        entityType: "member",
        entityId: event.payload.memberId,
        oldData: { role: event.payload.previousRole },
        newData: { role: event.payload.role },
      });
    },
  },
  "organizations.member-removed": {
    id: "audit-logs.member-removed",
    run: async (event) => {
      await trackAudit({
        ...auditOrigin(event),
        action: "member.removed",
        entityType: "member",
        entityId: event.payload.memberId,
        oldData: { userId: event.payload.userId, role: event.payload.role },
      });
    },
  },
});
