import { describe, expect, it } from "vitest";
import { moduleEvents, moduleSubscribers } from "@/modules.generated";
import { coreEvents } from "../core-events";
import { createEventBus } from "../event-bus";

describe("the generated registry and the core events", () => {
  it("the bus built from the real moduleEvents and moduleSubscribers constructs without an error", () => {
    expect(() =>
      createEventBus({
        core: coreEvents,
        events: moduleEvents,
        subscribers: moduleSubscribers,
      }),
    ).not.toThrow();
  });

  it("the generated registry exports moduleEvents and moduleSubscribers as lists", () => {
    expect(Array.isArray(moduleEvents)).toBe(true);
    expect(Array.isArray(moduleSubscribers)).toBe(true);
  });
});
