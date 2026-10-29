import { format } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@/components/ui/data-table";
import type { ApiKeyRow } from "../contracts/api-key.types";

export type ApiKeyStatus = "active" | "revoked" | "expired";

export function resolveApiKeyStatus(key: ApiKeyRow, now: Date): ApiKeyStatus {
  if (key.revokedAt) {
    return "revoked";
  }
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

const STATUS_VARIANT = {
  active: "success",
  revoked: "destructive",
  expired: "secondary",
} as const;

interface ApiKeyColumnsOptions {
  t: (key: string) => string;
  scopeLabel: (scope: string) => string;
  dateLocale: DateFnsLocale;
  now: Date;
  pending: boolean;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
}

export function buildApiKeyColumns({
  t,
  scopeLabel,
  dateLocale,
  now,
  pending,
  onRevoke,
  onDelete,
}: ApiKeyColumnsOptions): ColumnDef<ApiKeyRow>[] {
  return [
    {
      accessorKey: "name",
      header: t("column-name"),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "displayPrefix",
      header: t("column-key"),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.displayPrefix}…
        </span>
      ),
    },
    {
      id: "scopes",
      enableSorting: false,
      header: t("column-scopes"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.scopes.map((scope) => (
            <Badge key={scope} variant="outline">
              {scopeLabel(scope)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "lastUsedAt",
      header: t("column-last-used"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {row.original.lastUsedAt
            ? format(row.original.lastUsedAt, "d MMM yyyy, HH:mm", {
                locale: dateLocale,
              })
            : t("never-used")}
        </span>
      ),
    },
    {
      id: "status",
      header: t("column-status"),
      accessorFn: (key) => resolveApiKeyStatus(key, now),
      cell: ({ row }) => {
        const status = resolveApiKeyStatus(row.original, now);
        return (
          <Badge variant={STATUS_VARIANT[status]}>
            {t(`status-${status}`)}
          </Badge>
        );
      },
    },
    {
      id: "author",
      header: t("column-author"),
      accessorFn: (key) => key.createdBy?.name ?? "",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.createdBy?.name ?? "-"}</span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {!row.original.revokedAt && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onRevoke(row.original.id)}
            >
              {t("revoke")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onDelete(row.original.id)}
          >
            {t("delete")}
          </Button>
        </div>
      ),
    },
  ];
}
