import type { UserRole } from "@/shared/lib/auth/roles";

export interface UserAccountListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
}

// WHY: type aliases, not interfaces: ClientSlot passes the context as Record<string, unknown>,
// and only a type alias is assignable to an index signature.
export type UserTableRowActionProps = {
  userId: string;
  organizationId: string;
};

export type UserTableCellProps = {
  row: UserAccountListItem;
  organizationId: string;
};
