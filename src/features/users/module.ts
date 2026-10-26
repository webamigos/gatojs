import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "users",
  nav: [{ href: "/users", labelKey: "nav", icon: "users", order: 80 }],
  routePrefixes: ["/users"],
  adminOnly: true,
  multiOrgRoles: ["owner", "admin"],
});
