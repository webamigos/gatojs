import type { UserRole } from "@/shared/lib/auth/roles";

export interface UserAccountListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
}
