import type { AuditEvent } from "@/shared/lib/audit";

export const AUDITED_ORGANIZATION_PATHS: ReadonlySet<string> = new Set([
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/accept-invitation",
  "/organization/update-member-role",
  "/organization/remove-member",
]);

export interface OrganizationAuditInput {
  path: string;
  actorUserId: string | null;
  body: unknown;
  returned: unknown;
  previousRole?: string;
}

interface InvitationShape {
  id: string;
  organizationId: string;
  email: string;
  role: string;
}

interface MemberShape {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasStrings(value: unknown, keys: string[]): boolean {
  return isRecord(value) && keys.every((key) => typeof value[key] === "string");
}

function asInvitation(value: unknown): InvitationShape | null {
  return hasStrings(value, ["id", "organizationId", "email", "role"])
    ? (value as InvitationShape)
    : null;
}

function asMember(value: unknown): MemberShape | null {
  return hasStrings(value, ["id", "organizationId", "userId", "role"])
    ? (value as MemberShape)
    : null;
}

function invitationEvent(
  invitation: InvitationShape,
  actorUserId: string | null,
  action: string,
): AuditEvent {
  return {
    organizationId: invitation.organizationId,
    actorUserId,
    action,
    entityType: "invitation",
    entityId: invitation.id,
  };
}

export function organizationAuditEvent(
  input: OrganizationAuditInput,
): AuditEvent | null {
  const { path, actorUserId, returned } = input;
  switch (path) {
    case "/organization/invite-member": {
      const invitation = asInvitation(returned);
      return invitation
        ? {
            ...invitationEvent(invitation, actorUserId, "member.invited"),
            newData: { email: invitation.email, role: invitation.role },
          }
        : null;
    }
    case "/organization/cancel-invitation": {
      const invitation = asInvitation(returned);
      return invitation
        ? invitationEvent(invitation, actorUserId, "invitation.canceled")
        : null;
    }
    case "/organization/accept-invitation": {
      const invitation = asInvitation(
        isRecord(returned) ? returned.invitation : null,
      );
      return invitation
        ? invitationEvent(invitation, actorUserId, "invitation.accepted")
        : null;
    }
    case "/organization/update-member-role": {
      const member = asMember(returned);
      return member
        ? {
            organizationId: member.organizationId,
            actorUserId,
            action: "member.role_changed",
            entityType: "member",
            entityId: member.id,
            ...(input.previousRole === undefined
              ? {}
              : { oldData: { role: input.previousRole } }),
            newData: { role: member.role },
          }
        : null;
    }
    case "/organization/remove-member": {
      const member = asMember(isRecord(returned) ? returned.member : null);
      return member
        ? {
            organizationId: member.organizationId,
            actorUserId,
            action: "member.removed",
            entityType: "member",
            entityId: member.id,
            oldData: { userId: member.userId, role: member.role },
          }
        : null;
    }
    default:
      return null;
  }
}
