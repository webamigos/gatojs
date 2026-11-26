import { defineSlot } from "@/shared/lib/modules/slots";

declare module "@/shared/lib/modules/slots" {
  interface SlotContextMap {
    "account.sections": { userId: string };
  }
}

export const slotDefinitions = [
  defineSlot("account.sections", { kind: "server" }),
];
