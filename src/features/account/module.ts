import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "account",
  nav: [
    {
      id: "account.home",
      href: "/account",
      labelKey: "nav",
      icon: "user-cog",
      order: 90,
    },
  ],
  routePrefixes: ["/account"],
});
