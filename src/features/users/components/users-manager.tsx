"use client";

import { useCallback, useMemo, useState } from "react";
import { pl, enUS } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { DataTable } from "@/components/ui/data-table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { useRouter } from "@/i18n/routing";
import { clientModuleSlots } from "@/modules.client.generated";
import { authClient } from "@/shared/lib/auth/client";
import type { OrgRole, UserRole } from "@/shared/lib/auth/roles";
import { visibleContributions } from "@/shared/lib/modules/slot-access";
import { logImpersonationStartCommand } from "../services/commands/impersonation-commands";
import { InviteUserDialog } from "./invite-user-dialog";
import type { UserAccountListItem } from "../contracts/user-account.types";
import { buildUserAccountColumns } from "./user-account-columns";
import { buildContributedUserColumns } from "./user-table-slot-columns";

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = { pl, en: enUS };

interface UsersManagerProps {
  users: UserAccountListItem[];
  currentUserId: string;
  currentUserRole: UserRole;
  adminImpersonation: boolean;
  organizationId: string;
  currentOrgRole: OrgRole | null;
  multiOrg: boolean;
}

export function UsersManager({
  users,
  currentUserId,
  currentUserRole,
  adminImpersonation,
  organizationId,
  currentOrgRole,
  multiOrg,
}: UsersManagerProps) {
  const t = useTranslations("users");
  const translateAny = useTranslations();
  const router = useRouter();
  const dateLocale = DATE_FNS_LOCALES[useLocale()] ?? pl;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const viewer = useMemo(
    () => ({
      userRole: currentUserRole,
      orgRole: currentOrgRole,
      multiOrg,
    }),
    [currentUserRole, currentOrgRole, multiOrg],
  );

  const handleImpersonate = useCallback(
    async (userId: string) => {
      setPendingId(userId);
      try {
        const { error } = await authClient.admin.impersonateUser({ userId });
        if (error) {
          toast.error(t("impersonate-error"));
          return;
        }
        const loggingResult = await logImpersonationStartCommand();
        if (!loggingResult.success) {
          // eslint-disable-next-line no-console -- client components have no server logger
          console.error(
            "Impersonation-start logging failed:",
            loggingResult.error,
          );
        }
        router.push("/dashboard");
        router.refresh();
      } finally {
        setPendingId(null);
      }
    },
    [t, router],
  );

  const columns = useMemo(() => {
    const contributed = buildContributedUserColumns(
      visibleContributions(clientModuleSlots, "users.table.columns", viewer),
      (key) => translateAny(key),
      organizationId,
    );
    return buildUserAccountColumns(
      t,
      dateLocale,
      {
        userId: currentUserId,
        role: currentUserRole,
        adminImpersonation,
        organizationId,
        orgRole: currentOrgRole,
        multiOrg,
      },
      pendingId,
      handleImpersonate,
      contributed,
    );
  }, [
    t,
    translateAny,
    dateLocale,
    viewer,
    currentUserId,
    currentUserRole,
    currentOrgRole,
    multiOrg,
    organizationId,
    adminImpersonation,
    pendingId,
    handleImpersonate,
  ]);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <UsersIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
        </div>
        <CardAction>
          <InviteUserDialog viewer={viewer} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <UsersIcon className="mx-auto mb-2 h-8 w-8" />
            {t("no-users")}
          </div>
        ) : (
          <DataTable columns={columns} data={users} />
        )}
      </CardContent>
    </Card>
  );
}
