"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { format } from "date-fns";
import { pl, enUS } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { SortingState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTable,
  DataTablePagination,
  type ColumnDef,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useRouter } from "@/i18n/routing";
import { clientModules } from "@/modules.client.generated";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type { PaginatedResult } from "@/shared/types/common";
import {
  AUDIT_LOG_PAGE_SIZES,
  AUDIT_LOG_SORT_COLUMNS,
  type AuditLogActorOption,
  type AuditLogFilters,
  type AuditLogRow,
  type AuditLogSortColumn,
} from "../contracts/audit-log.types";
import { findAuditActionLabel } from "../services/audit-action-labels";

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = { pl, en: enUS };
const ALL = "all";

interface AuditLogViewProps {
  result: PaginatedResult<AuditLogRow>;
  filters: AuditLogFilters;
  actors: AuditLogActorOption[];
}

const registry: readonly ModuleDef[] = clientModules;
const declaredActions = registry.flatMap(
  (moduleDef) => moduleDef.auditActions ?? [],
);

function dateInputValue(date: Date | undefined, raw: string | null): string {
  // WHY: the filter date is local midnight in the server zone; the browser
  // zone may differ, so the input shows the validated day from the URL.
  return date && raw ? raw : "";
}

function isSortColumn(id: string): id is AuditLogSortColumn {
  return (AUDIT_LOG_SORT_COLUMNS as readonly string[]).includes(id);
}

function useUrlParams() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(`/audit-log?${params.toString()}`);
  }

  function setFilter(key: string, value: string | null | undefined) {
    update((params) => {
      if (value && value !== ALL) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
    });
  }

  return {
    searchParams,
    update,
    setFilter,
    clear: () => router.push("/audit-log"),
  };
}

function subscribeToNothing() {
  return () => {};
}

function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function CreatedAtCell({
  createdAt,
  locale,
}: {
  createdAt: Date;
  locale: DateFnsLocale;
}) {
  const isMounted = useIsMounted();
  return (
    <time
      dateTime={createdAt.toISOString()}
      className="whitespace-nowrap text-xs text-muted-foreground"
    >
      {isMounted ? format(createdAt, "d MMM yyyy HH:mm:ss", { locale }) : null}
    </time>
  );
}

interface TextFilterFieldProps {
  id: string;
  label: string;
  className: string;
  value: string | undefined;
  onCommit: (value: string) => void;
}

function TextFilterField({
  id,
  label,
  className,
  value,
  onCommit,
}: TextFilterFieldProps) {
  const current = value ?? "";
  const [draft, setDraft] = useState(current);
  const [syncedValue, setSyncedValue] = useState(current);
  const [isFocused, setIsFocused] = useState(false);

  if (current !== syncedValue) {
    setSyncedValue(current);
    if (!isFocused) {
      setDraft(current);
    }
  }

  function handleBlur(text: string) {
    setIsFocused(false);
    if (text.trim() !== current) {
      onCommit(text);
    }
  }

  return (
    <div className="w-full space-y-1 sm:w-auto">
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <Input
        id={id}
        className={className}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={(event) => handleBlur(event.target.value)}
      />
    </div>
  );
}

function ChangeDetails({ row }: { row: AuditLogRow }) {
  const t = useTranslations("audit-logs");
  const sections = [
    { label: t("detail-before"), data: row.oldData },
    { label: t("detail-after"), data: row.newData },
  ];
  return (
    <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
      {sections.map(({ label, data }) => (
        <div key={label}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <pre className="overflow-x-auto rounded border bg-background p-2 text-[11px]">
            {data === null ? "-" : JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function AuditLogView({ result, filters, actors }: AuditLogViewProps) {
  const t = useTranslations("audit-logs");
  const tc = useTranslations("common");
  const dateLocale = DATE_FNS_LOCALES[useLocale()] ?? pl;
  const { searchParams, update, setFilter, clear } = useUrlParams();

  const root = useTranslations();
  const actionLabel = useMemo(
    () => (action: string) => {
      const found = findAuditActionLabel(action, registry);
      return found ? root(`${found.namespace}.${found.labelKey}`) : action;
    },
    [root],
  );

  const sorting: SortingState = [
    { id: filters.sortBy, desc: filters.sortDir === "desc" },
  ];

  function handleSortingChange(next: SortingState) {
    const [first] = next;
    update((params) => {
      if (first && isSortColumn(first.id)) {
        params.set("sortBy", first.id);
        params.set("sortDir", first.desc ? "desc" : "asc");
      } else {
        params.delete("sortBy");
        params.delete("sortDir");
      }
      params.delete("page");
    });
  }

  const columns = useMemo(
    (): ColumnDef<AuditLogRow>[] => [
      {
        id: "createdAt",
        accessorFn: (row) => row.createdAt,
        header: t("col-date"),
        meta: { label: t("col-date") },
        cell: ({ row }) => (
          <CreatedAtCell
            createdAt={row.original.createdAt}
            locale={dateLocale}
          />
        ),
      },
      {
        id: "action",
        accessorFn: (row) => row.action,
        header: t("col-action"),
        meta: { label: t("col-action") },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm">{actionLabel(row.original.action)}</span>
            {row.original.channel === "API" && (
              <Badge variant="info">{t("badge-api")}</Badge>
            )}
            {row.original.serviceMode && (
              <Badge variant="warning">{t("badge-service-mode")}</Badge>
            )}
          </div>
        ),
      },
      {
        id: "entityType",
        accessorFn: (row) => row.entityType,
        header: t("col-entity"),
        meta: { label: t("col-entity") },
        cell: ({ row }) => (
          <div>
            <div className="text-xs text-muted-foreground">
              {row.original.entityType}
            </div>
            {row.original.entityId && (
              <div className="max-w-[220px] truncate font-mono text-[11px]">
                {row.original.entityId}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "actor",
        header: t("col-user"),
        meta: { label: t("col-user") },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.actor?.name ?? t("source-system")}
          </span>
        ),
      },
    ],
    [t, dateLocale, actionLabel],
  );

  const isFiltered = Boolean(
    filters.action ||
    filters.entityType ||
    filters.entityId ||
    filters.userId ||
    filters.from ||
    filters.to,
  );

  const selectedActor = actors.find((actor) => actor.id === filters.userId);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1 sm:w-auto">
              <Label className="text-xs">{t("filter-action")}</Label>
              <Select
                value={filters.action ?? ALL}
                onValueChange={(value) => setFilter("action", value)}
              >
                <SelectTrigger className="w-full sm:w-[240px]">
                  <span>
                    {filters.action ? actionLabel(filters.action) : t("all")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("all")}</SelectItem>
                  {declaredActions.map(({ action }) => (
                    <SelectItem key={action} value={action}>
                      {actionLabel(action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TextFilterField
              id="audit-log-entity-type"
              label={t("filter-entity-type")}
              className="w-full sm:w-[180px]"
              value={filters.entityType}
              onCommit={(value) => setFilter("entityType", value)}
            />
            <TextFilterField
              id="audit-log-entity-id"
              label={t("filter-entity-id")}
              className="w-full sm:w-[200px]"
              value={filters.entityId}
              onCommit={(value) => setFilter("entityId", value)}
            />
            {actors.length > 0 && (
              <div className="w-full space-y-1 sm:w-auto">
                <Label className="text-xs">{t("filter-user")}</Label>
                <Select
                  value={filters.userId ?? ALL}
                  onValueChange={(value) => setFilter("userId", value)}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <span>{selectedActor?.name ?? t("all")}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("all")}</SelectItem>
                    {actors.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        {actor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-full space-y-1 sm:w-auto">
              <Label className="text-xs" htmlFor="audit-log-from">
                {t("filter-from")}
              </Label>
              <Input
                id="audit-log-from"
                type="date"
                value={dateInputValue(filters.from, searchParams.get("from"))}
                onChange={(event) => setFilter("from", event.target.value)}
              />
            </div>
            <div className="w-full space-y-1 sm:w-auto">
              <Label className="text-xs" htmlFor="audit-log-to">
                {t("filter-to")}
              </Label>
              <Input
                id="audit-log-to"
                type="date"
                value={dateInputValue(filters.to, searchParams.get("to"))}
                onChange={(event) => setFilter("to", event.target.value)}
              />
            </div>
            {isFiltered && (
              <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
                {tc("clear-filters")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result.items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t("no-results")}
        </div>
      ) : (
        <>
          <Card className="py-0">
            <CardContent className="p-0">
              <DataTable
                columns={columns}
                data={result.items}
                sorting={sorting}
                onSortingChange={handleSortingChange}
                enableMultiSort={false}
                emptyMessage={t("no-results")}
                storageKey="audit-log"
                renderSubRow={(row) =>
                  row.original.oldData === null &&
                  row.original.newData === null ? null : (
                    <ChangeDetails row={row.original} />
                  )
                }
              />
            </CardContent>
          </Card>
          <DataTablePagination
            page={result.currentPage}
            pageSize={result.pageSize}
            total={result.totalItems}
            pageSizeOptions={[...AUDIT_LOG_PAGE_SIZES]}
            onPageChange={(page) =>
              update((params) => params.set("page", String(page)))
            }
            onPageSizeChange={(size) =>
              update((params) => {
                params.set("pageSize", String(size));
                params.delete("page");
              })
            }
            resultsLabel={(from, to, total) =>
              t("results", { from, to, total })
            }
            pageSizeLabel={t("page-size")}
            previousLabel={t("previous")}
            nextLabel={t("next")}
          />
        </>
      )}
    </div>
  );
}
