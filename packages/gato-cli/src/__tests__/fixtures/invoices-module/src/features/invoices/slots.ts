import { defineContribution } from "@/shared/lib/modules/slots";

export const slots = [
  defineContribution("dashboard.sections", {
    id: "invoices.unpaid-card",
    priority: 20,
    roles: ["owner", "admin"],
    component: () => import("./components/unpaid-invoices-card"),
  }),
];
