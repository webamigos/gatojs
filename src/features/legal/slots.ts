import {
  defineContribution,
  type SlotContribution,
} from "@/shared/lib/modules/slots";

export const slots: SlotContribution[] = [
  defineContribution("app.root", {
    id: "legal.cookie-banner",
    priority: 1000,
    component: () => import("./components/cookie-banner-slot"),
  }),
  defineContribution("auth.footer", {
    id: "legal.auth-footer-links",
    priority: 100,
    component: () => import("./components/legal-links-slot"),
  }),
  defineContribution("app.sidebar.footer", {
    id: "legal.sidebar-footer-links",
    priority: 100,
    component: () => import("./components/legal-links-slot"),
  }),
];
