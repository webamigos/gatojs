import { format } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns";
import { UserCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ColumnDef } from "@/components/ui/data-table";
import { USER_ROLES, type UserRole } from "@/shared/lib/auth/roles";
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

export function buildUserAccountColumns(
  t: ReturnType<typeof useTranslations<"users">>,
  dateLocale: DateFnsLocale,
  currentUserId: string,
  pendingId: string | null,
  onImpersonate: (userId: string) => void,
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
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onImpersonate(row.original.id)}
            disabled={row.original.id === currentUserId || pendingId !== null}
            aria-label={t("action-impersonate")}
            title={t("action-impersonate")}
          >
            <UserCog className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];
}
