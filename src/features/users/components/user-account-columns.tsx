import { format } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns";
import { UserCog } from "lucide-react";
import type { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ColumnDef } from "@/components/ui/data-table";
import { ClientSlot } from "@/shared/components/client-slot";
import { canImpersonate } from "@/shared/lib/auth/impersonation-policy";
import {
  USER_ROLES,
  type OrgRole,
  type UserRole,
} from "@/shared/lib/auth/roles";
import type { UserAccountListItem } from "../contracts/user-account.types";

const ROLE_BADGES: Record<
  UserRole,
  {
    labelKey: "role-user" | "role-admin" | "role-superadmin";
    variant: "outline" | "info" | "warning";
  }
> = {
  [USER_ROLES.USER]: { labelKey: "role-user", variant: "outline" },
  [USER_ROLES.ADMIN]: { labelKey: "role-admin", variant: "info" },
  [USER_ROLES.SUPERADMIN]: { labelKey: "role-superadmin", variant: "warning" },
};

export interface UserAccountViewer {
  userId: string;
  role: UserRole;
  adminImpersonation: boolean;
  organizationId: string;
  orgRole: OrgRole | null;
  multiOrg: boolean;
}

export function buildUserAccountColumns(
  t: ReturnType<typeof useTranslations<"users">>,
  dateLocale: DateFnsLocale,
  viewer: UserAccountViewer,
  pendingId: string | null,
  onImpersonate: (userId: string) => void,
  contributedColumns: readonly ColumnDef<UserAccountListItem>[],
): ColumnDef<UserAccountListItem>[] {
  return [
    {
      accessorKey: "name",
      header: t("col-name"),
      meta: { label: t("col-name") },
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "email",
      header: t("col-email"),
      meta: { label: t("col-email") },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.email}
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: t("col-role"),
      meta: { label: t("col-role") },
      cell: ({ row }) => {
        const badge = ROLE_BADGES[row.original.role];
        return <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>;
      },
    },
    {
      accessorKey: "createdAt",
      header: t("col-created"),
      meta: { label: t("col-created") },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {format(new Date(row.original.createdAt), "d MMM yyyy", {
            locale: dateLocale,
          })}
        </span>
      ),
    },
    ...contributedColumns,
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const showImpersonate =
          row.original.id !== viewer.userId &&
          canImpersonate({
            actorRole: viewer.role,
            targetRole: row.original.role,
            adminImpersonation: viewer.adminImpersonation,
          });
        return (
          <div className="flex justify-end">
            {showImpersonate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onImpersonate(row.original.id)}
                disabled={pendingId !== null}
                aria-label={t("action-impersonate")}
                title={t("action-impersonate")}
              >
                <UserCog className="h-4 w-4" />
              </Button>
            )}
            <ClientSlot
              id="users.table.row-actions"
              context={{
                userId: row.original.id,
                organizationId: viewer.organizationId,
              }}
              viewer={{
                userRole: viewer.role,
                orgRole: viewer.orgRole,
                multiOrg: viewer.multiOrg,
              }}
            />
          </div>
        );
      },
    },
  ];
}
