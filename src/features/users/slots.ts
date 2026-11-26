import { defineSlot } from "@/shared/lib/modules/slots";
import type {
  UserTableCellProps,
  UserTableRowActionProps,
} from "./contracts/user-account.types";

declare module "@/shared/lib/modules/slots" {
  interface ClientSlotContextMap {
    "users.table.row-actions": UserTableRowActionProps;
    "users.table.columns": UserTableCellProps;
  }
}

export const slotDefinitions = [
  defineSlot("users.table.row-actions", { kind: "client" }),
  defineSlot("users.table.columns", { kind: "client" }),
];
