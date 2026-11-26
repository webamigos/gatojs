import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { logger } from "@/shared/lib/logger";
import type { ModuleEntry } from "@/shared/lib/modules/gato-config";
import {
  EventError,
  type EventMap,
  type EventOrigin,
  type EventSchema,
  type EventSubscriber,
  type LooseSubscriberMap,
} from "./define-events";

export interface EventBusInput {
  core: EventMap;
  events: readonly ModuleEntry<EventMap>[];
  subscribers: readonly ModuleEntry<LooseSubscriberMap>[];
}

export interface EventBus {
  emit(origin: EventOrigin, name: string, payload: unknown): Promise<void>;
}

interface DeclaredEvent {
  module: string | null;
  name: string;
  schema: EventSchema;
}

const MAX_EVENT_DEPTH = 8;

interface RegisteredSubscriber {
  module: string;
  event: string;
  subscriber: EventSubscriber;
}

function isSubscriberList(
  value: EventSubscriber | readonly EventSubscriber[],
): value is readonly EventSubscriber[] {
  return Array.isArray(value);
}

function subscriberList(
  value: LooseSubscriberMap[string],
): readonly EventSubscriber[] {
  if (value === undefined) {
    return [];
  }
  return isSubscriberList(value) ? value : [value];
}

function byId(left: EventSubscriber, right: EventSubscriber): number {
  return left.id < right.id ? -1 : 1;
}

function repeated(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.filter((value, index) => values.indexOf(value) !== index),
    ),
  ];
}

function declaredEvents(input: EventBusInput): DeclaredEvent[] {
  return [
    ...Object.entries(input.core).map(([name, schema]) => ({
      module: null,
      name,
      schema,
    })),
    ...input.events.flatMap((entry) =>
      Object.entries(entry.value).map(([name, schema]) => ({
        module: entry.module,
        name,
        schema,
      })),
    ),
  ];
}

function registeredSubscribers(input: EventBusInput): RegisteredSubscriber[] {
  return input.subscribers.flatMap((entry) =>
    Object.entries(entry.value).flatMap(([event, value]) =>
      [...subscriberList(value)].sort(byId).map((subscriber) => ({
        module: entry.module,
        event,
        subscriber,
      })),
    ),
  );
}

function schemaProblems(event: DeclaredEvent): string[] {
  const schema: unknown = event.schema;
  if (!(schema instanceof z.ZodObject)) {
    return [`event ${event.name} must be a z.object() schema`];
  }
  return [
    ...(schema.def.catchall === undefined
      ? []
      : [`event ${event.name} must be a z.object() that strips unknown keys`]),
    ...(Object.hasOwn(schema.shape, "organizationId")
      ? [
          `event ${event.name} must not declare organizationId; emitEvent sets it`,
        ]
      : []),
  ];
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function registryProblems(
  declared: readonly DeclaredEvent[],
  registered: readonly RegisteredSubscriber[],
): string[] {
  const names = new Set(declared.map((event) => event.name));
  return [
    ...declared
      .filter(
        (event) =>
          event.module !== null && !event.name.startsWith(`${event.module}.`),
      )
      .map(
        (event) =>
          `event keys must start with "${event.module}.": ${event.name}`,
      ),
    ...repeated(declared.map((event) => event.name)).map(
      (name) => `duplicate event: ${name}`,
    ),
    ...declared.flatMap(schemaProblems),
    ...registered
      .filter(
        ({ module, subscriber }) => !subscriber.id.startsWith(`${module}.`),
      )
      .map(
        ({ module, subscriber }) =>
          `subscriber ids must start with "${module}.": ${subscriber.id}`,
      ),
    ...repeated(registered.map(({ subscriber }) => subscriber.id)).map(
      (id) => `duplicate subscriber: ${id}`,
    ),
    ...registered
      .filter(({ event }) => !names.has(event))
      .map(
        ({ event, subscriber }) =>
          `unknown event: ${event} (subscriber ${subscriber.id})`,
      ),
  ];
}

function subscribersByEvent(
  registered: readonly RegisteredSubscriber[],
): Map<string, EventSubscriber[]> {
  const byEvent = new Map<string, EventSubscriber[]>();
  for (const { event, subscriber } of registered) {
    byEvent.set(event, [...(byEvent.get(event) ?? []), subscriber]);
  }
  return byEvent;
}

export function createEventBus(input: EventBusInput): EventBus {
  const declared = declaredEvents(input);
  const registered = registeredSubscribers(input);
  const problems = registryProblems(declared, registered);
  if (problems.length > 0) {
    throw new EventError(problems.join("\n"));
  }
  const schemas = new Map(declared.map((event) => [event.name, event.schema]));
  const subscribers = subscribersByEvent(registered);
  const depthStorage = new AsyncLocalStorage<number>();

  return {
    async emit(origin, name, payload) {
      const schema = schemas.get(name);
      if (schema === undefined) {
        throw new EventError(`unknown event: ${name}`);
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new EventError(`invalid payload for ${name}`, {
          cause: parsed.error,
        });
      }
      const event = Object.freeze({
        name,
        organizationId: origin.organizationId,
        actorUserId: origin.actorUserId,
        serviceMode: origin.serviceMode === true,
        payload: deepFreeze(parsed.data),
      });
      const depth = depthStorage.getStore() ?? 0;
      if (depth >= MAX_EVENT_DEPTH) {
        logger.error("Event depth exceeded", {
          event: name,
          error: new EventError(
            `event depth exceeded ${MAX_EVENT_DEPTH}: ${name}`,
          ),
        });
        return;
      }
      for (const subscriber of subscribers.get(name) ?? []) {
        try {
          await depthStorage.run(depth + 1, () => subscriber.run(event));
        } catch (error) {
          logger.error("Event subscriber failed", {
            event: name,
            subscriber: subscriber.id,
            error,
          });
        }
      }
    },
  };
}
