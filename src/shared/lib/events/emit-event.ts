import { moduleEvents, moduleSubscribers } from "@/modules.generated";
import { coreEvents } from "./core-events";
import type { EventName, EventOrigin, EventPayload } from "./define-events";
import { createEventBus, type EventBus } from "./event-bus";

let registryBus: EventBus | undefined;

// WHY: a subscriber that emits imports this file from the registry, so the bus reads the
// registry on the first emit, never while the modules are still being evaluated.
function bus(): EventBus {
  registryBus ??= createEventBus({
    core: coreEvents,
    events: moduleEvents,
    subscribers: moduleSubscribers,
  });
  return registryBus;
}

export async function emitEvent<N extends EventName>(
  origin: EventOrigin,
  name: N,
  payload: EventPayload<N>,
): Promise<void> {
  await bus().emit(origin, name, payload);
}
