import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "legal",
  public: true,
  routePrefixes: ["/terms", "/privacy"],
  nav: [
    {
      id: "legal.privacy",
      href: "/privacy",
      labelKey: "nav-privacy",
      icon: "shield",
      order: 900,
    },
    {
      id: "legal.terms",
      href: "/terms",
      labelKey: "nav-terms",
      icon: "file-text",
      order: 910,
    },
  ],
});
