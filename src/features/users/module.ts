import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "users",
  nav: [
    {
      id: "users.list",
      href: "/users",
      labelKey: "nav",
      multiOrgLabelKey: "nav-members",
      icon: "users",
      order: 80,
    },
  ],
  routePrefixes: ["/users"],
  adminOnly: true,
  multiOrgRoles: ["owner", "admin"],
});
