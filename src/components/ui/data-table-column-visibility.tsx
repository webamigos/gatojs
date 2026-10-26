"use client";

import type {
  ColumnDef,
  Updater,
  VisibilityState,
} from "@tanstack/react-table";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DataTableColumnVisibilityProps<TData> {
  columns: ColumnDef<TData>[];
  visibility: VisibilityState;
  onVisibilityChange: (updater: Updater<VisibilityState>) => void;
}

function getColumnId<TData>(column: ColumnDef<TData>): string | undefined {
  if (column.id) {
    return column.id;
  }
  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey;
  }
  return undefined;
}

export function getHideableColumnDefs<TData>(columns: ColumnDef<TData>[]) {
  return columns.filter((column) => column.enableHiding !== false);
}

export function DataTableColumnVisibility<TData>({
  columns,
  visibility,
  onVisibilityChange,
}: DataTableColumnVisibilityProps<TData>) {
  const t = useTranslations("common");
  const hideableColumns = getHideableColumnDefs(columns);

  if (hideableColumns.length < 2) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        {t("columns")}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-60"
        aria-label={t("columns-aria-label")}
      >
        <div className="flex items-center justify-between px-1.5 pt-1 pb-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("columns-panel-title")}
          </span>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => onVisibilityChange({})}
          >
            {t("columns-reset")}
          </button>
        </div>
        {hideableColumns.map((column) => {
          const id = getColumnId(column);
          if (!id) {
            return null;
          }
          const label = column.meta?.label ?? id;
          const isVisible = visibility[id] !== false;
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-2 rounded-sm px-1.5 py-1.5 text-sm"
            >
              <label
                htmlFor={`column-visibility-${id}`}
                className="cursor-pointer"
              >
                {label}
              </label>
              <Switch
                id={`column-visibility-${id}`}
                checked={isVisible}
                onCheckedChange={(checked) =>
                  onVisibilityChange({ ...visibility, [id]: checked })
                }
                aria-label={String(label)}
              />
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
