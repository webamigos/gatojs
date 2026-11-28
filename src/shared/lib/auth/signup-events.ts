import type {
  AppliedSignupMembership,
  SignupMembership,
} from "@/features/organizations/services/signup-membership";
import type {
  EventOrigin,
  EventPayload,
} from "@/shared/lib/events/define-events";

export interface SignupEventInput {
  userId: string;
  email: string;
  membership: SignupMembership;
  applied: AppliedSignupMembership;
}

type SignupEventName =
  "auth.signed-up" | "users.invitation-accepted" | "organizations.member-added";

export type SignupEventEmit = {
  [N in SignupEventName]: {
    origin: EventOrigin;
    name: N;
    payload: EventPayload<N>;
  };
}[SignupEventName];

function signupOrigin(input: SignupEventInput): EventOrigin {
  return {
    organizationId: input.applied.organizationId,
    actorUserId: input.userId,
  };
}

function invitationAcceptedEvents(
  input: SignupEventInput,
  invitationId: string | undefined,
): SignupEventEmit[] {
  if (!invitationId) {
    return [];
  }
  return [
    {
      origin: signupOrigin(input),
      name: "users.invitation-accepted",
      payload: { invitationId, userId: input.userId },
    },
  ];
}

function joinEvents(
  input: SignupEventInput,
  memberId: string,
): SignupEventEmit[] {
  const { membership } = input;
  if (membership.action !== "join") {
    return [];
  }
  return [
    ...invitationAcceptedEvents(input, membership.invitationId),
    {
      origin: signupOrigin(input),
      name: "organizations.member-added",
      payload: { memberId, userId: input.userId, role: membership.role },
    },
  ];
}

export function signupEvents(input: SignupEventInput): SignupEventEmit[] {
  const signedUp: SignupEventEmit = {
    origin: signupOrigin(input),
    name: "auth.signed-up",
    payload: { userId: input.userId, email: input.email },
  };
  const { memberId } = input.applied;
  if (memberId === null) {
    return [signedUp];
  }
  return [signedUp, ...joinEvents(input, memberId)];
}
