import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "notes",
  nav: [{ href: "/notes", labelKey: "nav", icon: "notebook", order: 40 }],
  routePrefixes: ["/notes"],
});
