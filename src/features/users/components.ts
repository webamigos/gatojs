import { defineComponentHandle } from "@/shared/lib/modules/component-overrides";
import type { InviteUserDialogProps } from "./components/invite-user-dialog";

declare module "@/shared/lib/modules/component-overrides" {
  interface ComponentHandleMap {
    "users.invite-dialog": InviteUserDialogProps;
  }
}

export const componentHandles = [defineComponentHandle("users.invite-dialog")];
