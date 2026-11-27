import {
  defineContribution,
  type SlotContribution,
} from "@/shared/lib/modules/slots";

export const slots: SlotContribution[] = [
  defineContribution("app.header.actions", {
    id: "legal.cookie-banner",
    priority: 1000,
    component: () => import("./components/cookie-banner-slot"),
  }),
];
