import { defineSlot } from "@/shared/lib/modules/slots";

declare module "@/shared/lib/modules/slots" {
  interface SlotContextMap {
    "dashboard.sections": { organizationId: string };
  }
}

export const slotDefinitions = [
  defineSlot("dashboard.sections", { kind: "server" }),
];
