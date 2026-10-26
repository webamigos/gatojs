import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "auth",
  nav: [],
  routePrefixes: [
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/set-password",
  ],
  public: true,
});
