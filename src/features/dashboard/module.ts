import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "dashboard",
  nav: [
    {
      id: "dashboard.home",
      href: "/dashboard",
      labelKey: "nav",
      icon: "layout-dashboard",
      order: 10,
    },
  ],
  routePrefixes: ["/dashboard"],
});
