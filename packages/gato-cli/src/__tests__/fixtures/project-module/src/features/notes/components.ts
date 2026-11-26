import { defineComponentOverride } from "@/shared/lib/modules/component-overrides";

export const componentOverrides = [
  defineComponentOverride("users.invite-dialog", {
    wrap: () => import("./components/invite-dialog-with-notes"),
  }),
];
