import { defineContribution } from "@/shared/lib/modules/slots";

export const slots = [
  defineContribution("dashboard.sections", {
    id: "notes.summary-card",
    priority: 10,
    component: () => import("./components/notes-summary-card"),
  }),
];
