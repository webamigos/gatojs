import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "legal",
  public: true,
  routePrefixes: ["/terms", "/privacy"],
  nav: [],
});
