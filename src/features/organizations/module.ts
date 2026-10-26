import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "organizations",
  nav: [],
  routePrefixes: ["/accept-invitation", "/no-organization"],
  public: true,
});
