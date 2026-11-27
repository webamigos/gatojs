import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "invoices",
  nav: [
    {
      id: "invoices.list",
      href: "/invoices",
      labelKey: "nav",
      icon: "receipt",
      order: 30,
    },
  ],
  routePrefixes: ["/invoices"],
  roles: ["owner", "admin", "member"],
  auditActions: [
    { action: "invoice.issued", labelKey: "action-invoice-issued" },
  ],
  uploadPurposes: [
    {
      key: "invoice-pdf",
      mimeTypes: ["application/pdf"],
      maxBytes: 10 * 1024 * 1024,
      visibility: "organization",
    },
  ],
  commands: ["invoices.issue"],
});
