import type {
  EventOrigin,
  EventPayload,
} from "@/shared/lib/events/define-events";
import type { OrgRole } from "./roles";

export const ORGANIZATION_EVENT_PATHS: ReadonlySet<string> = new Set([
  "/organization/create",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/accept-invitation",
  "/organization/update-member-role",
  "/organization/remove-member",
]);

export interface PreviousMemberRole {
  memberId: string;
  role: string;
}

export interface OrganizationEventInput {
  path: string;
  actorUserId: string | null;
  returned: unknown;
  previousRole?: PreviousMemberRole;
}

type OrganizationEventName =
  | "organizations.created"
  | "organizations.member-added"
  | "organizations.member-removed"
  | "organizations.member-role-changed"
  | "users.invited"
  | "users.invitation-accepted"
  | "users.invitation-canceled";

export type OrganizationEventEmit = {
  [N in OrganizationEventName]: {
    origin: EventOrigin;
    name: N;
    payload: EventPayload<N>;
  };
}[OrganizationEventName];

export interface MemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
}

interface InvitationRow {
  id: string;
  organizationId: string;
}

interface InvitationWithRecipient extends InvitationRow {
  email: string;
  role: string;
}

interface CreatedOrganizationRow {
  id: string;
  name: string;
  slug: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function withStrings<T>(value: unknown, keys: readonly (keyof T)[]): T | null {
  if (!isRecord(value)) {
    return null;
  }
  return keys.every((key) => typeof value[key as string] === "string")
    ? (value as T)
    : null;
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export function readMember(value: unknown): MemberRow | null {
  return withStrings<MemberRow>(value, [
    "id",
    "organizationId",
    "userId",
    "role",
  ]);
}

function readInvitation(value: unknown): InvitationRow | null {
  return withStrings<InvitationRow>(value, ["id", "organizationId"]);
}

function readInvitationWithRecipient(
  value: unknown,
): InvitationWithRecipient | null {
  return withStrings<InvitationWithRecipient>(value, [
    "id",
    "organizationId",
    "email",
    "role",
  ]);
}

function readOwnerUserId(members: unknown): string | null {
  if (!Array.isArray(members)) {
    return null;
  }
  const ownerUserId = field(members[0], "userId");
  return typeof ownerUserId === "string" ? ownerUserId : null;
}

// WHY: roles pass through unchecked; the bus validates the payload and a role outside
// the organization roles fails the emit instead of being silently rewritten here.
function unvalidatedRole(role: string): OrgRole {
  return role as OrgRole;
}

function origin(
  organizationId: string,
  actorUserId: string | null,
): EventOrigin {
  return { organizationId, actorUserId };
}

function createdEvents(
  returned: unknown,
  actorUserId: string | null,
): OrganizationEventEmit[] {
  const organization = withStrings<CreatedOrganizationRow>(returned, [
    "id",
    "name",
    "slug",
  ]);
  const ownerUserId = readOwnerUserId(field(returned, "members"));
  if (!organization || ownerUserId === null) {
    return [];
  }
  return [
    {
      origin: origin(organization.id, actorUserId),
      name: "organizations.created",
      payload: {
        name: organization.name,
        slug: organization.slug,
        ownerUserId,
      },
    },
  ];
}

function invitedEvents(
  returned: unknown,
  actorUserId: string | null,
): OrganizationEventEmit[] {
  const invitation = readInvitationWithRecipient(returned);
  if (!invitation) {
    return [];
  }
  return [
    {
      origin: origin(invitation.organizationId, actorUserId),
      name: "users.invited",
      payload: {
        invitationId: invitation.id,
        email: invitation.email,
        role: unvalidatedRole(invitation.role),
      },
    },
  ];
}

function canceledEvents(
  returned: unknown,
  actorUserId: string | null,
): OrganizationEventEmit[] {
  const invitation = readInvitation(returned);
  if (!invitation) {
    return [];
  }
  return [
    {
      origin: origin(invitation.organizationId, actorUserId),
      name: "users.invitation-canceled",
      payload: { invitationId: invitation.id },
    },
  ];
}

function acceptedEvents(
  returned: unknown,
  actorUserId: string | null,
): OrganizationEventEmit[] {
  const invitation = readInvitation(field(returned, "invitation"));
  const member = readMember(field(returned, "member"));
  if (!invitation || !member) {
    return [];
  }
  return [
    {
      origin: origin(invitation.organizationId, actorUserId),
      name: "users.invitation-accepted",
      payload: { invitationId: invitation.id, userId: member.userId },
    },
    {
      origin: origin(member.organizationId, actorUserId),
      name: "organizations.member-added",
      payload: {
        memberId: member.id,
        userId: member.userId,
        role: unvalidatedRole(member.role),
      },
    },
  ];
}

function roleChangedEvents(
  input: OrganizationEventInput,
): OrganizationEventEmit[] {
  const member = readMember(input.returned);
  if (!member || input.previousRole?.memberId !== member.id) {
    return [];
  }
  return [
    {
      origin: origin(member.organizationId, input.actorUserId),
      name: "organizations.member-role-changed",
      payload: {
        memberId: member.id,
        userId: member.userId,
        previousRole: unvalidatedRole(input.previousRole.role),
        role: unvalidatedRole(member.role),
      },
    },
  ];
}

function removedEvents(
  returned: unknown,
  actorUserId: string | null,
): OrganizationEventEmit[] {
  const member = readMember(field(returned, "member"));
  if (!member) {
    return [];
  }
  return [
    {
      origin: origin(member.organizationId, actorUserId),
      name: "organizations.member-removed",
      payload: {
        memberId: member.id,
        userId: member.userId,
        role: unvalidatedRole(member.role),
      },
    },
  ];
}

export function organizationEvents(
  input: OrganizationEventInput,
): OrganizationEventEmit[] {
  const { path, actorUserId, returned } = input;
  switch (path) {
    case "/organization/create":
      return createdEvents(returned, actorUserId);
    case "/organization/invite-member":
      return invitedEvents(returned, actorUserId);
    case "/organization/cancel-invitation":
      return canceledEvents(returned, actorUserId);
    case "/organization/accept-invitation":
      return acceptedEvents(returned, actorUserId);
    case "/organization/update-member-role":
      return roleChangedEvents(input);
    case "/organization/remove-member":
      return removedEvents(returned, actorUserId);
    default:
      return [];
  }
}
