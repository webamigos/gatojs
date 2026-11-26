import type { z } from "zod";
import type { moduleEvents } from "@/modules.generated";
import type { OrgContext } from "@/shared/lib/auth/org-context";
import type { coreEvents } from "./core-events";

export type EventSchema = z.ZodObject<
  z.core.$ZodShape,
  z.core.$ZodObjectConfig
>;

export type EventMap = Record<string, EventSchema>;

export interface EventOrigin {
  organizationId: string;
  actorUserId: string | null;
  serviceMode?: boolean;
}

export interface DomainEvent<N extends string = string, P = unknown> {
  readonly name: N;
  readonly organizationId: string;
  readonly actorUserId: string | null;
  readonly serviceMode: boolean;
  readonly payload: Readonly<P>;
}

export interface EventSubscriber<E extends DomainEvent = DomainEvent> {
  id: string;
  run(event: E): Promise<void> | void;
}

export type LooseSubscriberMap = Record<
  string,
  EventSubscriber | readonly EventSubscriber[] | undefined
>;

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never;

type ModuleEventMaps = (typeof moduleEvents)[number]["value"];

export type KnownEvents = typeof coreEvents &
  UnionToIntersection<ModuleEventMaps>;

export type EventName = keyof KnownEvents & string;

export type EventPayload<N extends EventName> = z.input<KnownEvents[N]>;

export type EventOf<N extends EventName> = DomainEvent<
  N,
  z.output<KnownEvents[N]>
>;

export type SubscriberMap = {
  [N in EventName]?:
    EventSubscriber<EventOf<N>> | readonly EventSubscriber<EventOf<N>>[];
};

export class EventError extends Error {
  name = "EventError";
}

export function defineEvents<const M extends EventMap>(map: M): M {
  return map;
}

export function defineSubscribers<const M extends SubscriberMap>(map: M): M {
  return map;
}

export function eventOrigin(context: OrgContext): EventOrigin {
  return {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    serviceMode: context.serviceMode,
  };
}
