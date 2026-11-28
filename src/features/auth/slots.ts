import { defineSlot, type SlotDefinition } from "@/shared/lib/modules/slots";

declare module "@/shared/lib/modules/slots" {
  interface SlotContextMap {
    "auth.footer": { locale: string };
  }
}

export const slotDefinitions: SlotDefinition[] = [
  defineSlot("auth.footer", { kind: "server" }),
];
