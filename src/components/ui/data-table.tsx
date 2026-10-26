"use client";

import type {} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    label?: string;
  }
}

import {
  ColumnDef,
  Row,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  SortingState,
  Updater,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { Fragment, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useColumnVisibility } from "@/components/ui/use-column-visibility";
import {
  DataTableColumnVisibility,
  getHideableColumnDefs,
} from "@/components/ui/data-table-column-visibility";
import { TABLE_PAGE_SIZE_OPTIONS } from "@/shared/constants/table-pagination";

export type { ColumnDef, Row };

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

interface DataTablePaginationProps extends PaginationProps {
  resultsLabel?: (from: number, to: number, total: number) => string;
  pageSizeLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  resultsLabel = (from, to, tot) => `${from}–${to} z ${tot}`,
  pageSizeLabel = "Wierszy na stronę",
  previousLabel = "Poprzednia",
  nextLabel = "Następna",
}: DataTablePaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        {resultsLabel(
          Math.min((page - 1) * pageSize + 1, total),
          Math.min(page * pageSize, total),
          total,
        )}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {pageSizeLabel}
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger size="sm" aria-label={pageSizeLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(pageSizeOptions ?? TABLE_PAGE_SIZE_OPTIONS).map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          aria-label={previousLabel}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{previousLabel}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={nextLabel}
          disabled={page >= Math.ceil(total / pageSize)}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="hidden sm:inline">{nextLabel}</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  pagination?: PaginationProps;
  enableSorting?: boolean;
  enableMultiSort?: boolean;
  emptyMessage?: string;
  resultsLabel?: (from: number, to: number, total: number) => string;
  pageSizeLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  renderSubRow?: (row: Row<TData>) => React.ReactNode;
  /**
   * Makes each row activate on click / Enter / Space. Clicks coming from
   * controls inside a cell (edit, delete, …) must be stopped there — see
   * `EanMappingActions` — or they reach this handler too.
   */
  onRowClick?: (row: Row<TData>) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  storageKey?: string;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (updater: Updater<VisibilityState>) => void;
}

function resolveRowActivation<TData>(
  row: Row<TData>,
  isExpandable: boolean,
  onRowClick?: (row: Row<TData>) => void,
): (() => void) | undefined {
  if (isExpandable) {
    return row.getToggleExpandedHandler();
  }
  if (onRowClick) {
    return () => onRowClick(row);
  }
  return undefined;
}

export function DataTable<TData>({
  columns,
  data,
  pagination,
  enableSorting = true,
  enableMultiSort = true,
  emptyMessage = "Brak wyników.",
  resultsLabel = (from, to, total) => `${from}–${to} z ${total}`,
  pageSizeLabel = "Wierszy na stronę",
  previousLabel = "Poprzednia",
  nextLabel = "Następna",
  renderSubRow,
  onRowClick,
  sorting,
  onSortingChange,
  storageKey,
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange: controlledOnColumnVisibilityChange,
}: DataTableProps<TData>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [localColumnVisibility, setLocalColumnVisibility] =
    useColumnVisibility(storageKey);

  const isServerPaginated = !!pagination;
  const isControlledSort =
    sorting !== undefined && onSortingChange !== undefined;
  const isControlledVisibility =
    controlledColumnVisibility !== undefined &&
    controlledOnColumnVisibilityChange !== undefined;
  const columnVisibility = isControlledVisibility
    ? controlledColumnVisibility
    : localColumnVisibility;
  const onColumnVisibilityChange = isControlledVisibility
    ? controlledOnColumnVisibilityChange
    : setLocalColumnVisibility;

  const getSortConfig = () => {
    if (isControlledSort) {
      return {
        manualSorting: true,
        onSortingChange: (updater: Updater<SortingState>) => {
          const next =
            typeof updater === "function" ? updater(sorting!) : updater;
          onSortingChange(next);
        },
      };
    }
    if (isServerPaginated) {
      return { manualSorting: true };
    }
    return {
      getSortedRowModel: getSortedRowModel(),
      onSortingChange: setLocalSorting,
    };
  };

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting,
    isMultiSortEvent: enableMultiSort ? undefined : () => false,
    ...getSortConfig(),
    ...(renderSubRow && {
      getExpandedRowModel: getExpandedRowModel(),
      onExpandedChange: setExpanded,
      getRowCanExpand: () => true,
    }),
    manualPagination: isServerPaginated,
    pageCount: pagination
      ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
      : undefined,
    onColumnVisibilityChange,
    state: {
      sorting: isControlledSort ? sorting : localSorting,
      expanded,
      columnVisibility,
    },
  });

  const rows = table.getRowModel().rows;
  const hasHideableColumns = getHideableColumnDefs(columns).length >= 2;

  return (
    <div className="space-y-3">
      {!isControlledVisibility && hasHideableColumns && (
        <div className="flex justify-end">
          <DataTableColumnVisibility
            columns={columns}
            visibility={columnVisibility}
            onVisibilityChange={onColumnVisibilityChange}
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = enableSorting && header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={
                        (
                          header.column.columnDef.meta as
                            { className?: string } | undefined
                        )?.className
                      }
                      aria-sort={
                        // eslint-disable-next-line no-nested-ternary
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      {/* eslint-disable-next-line no-nested-ternary */}
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex w-full items-center gap-1 select-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
                            (
                              header.column.columnDef.meta as
                                { className?: string } | undefined
                            )?.className?.includes("text-right") &&
                              "justify-end",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <span
                            className={cn(
                              "text-muted-foreground",
                              (
                                header.column.columnDef.meta as
                                  { className?: string } | undefined
                              )?.className?.includes("text-right") &&
                                "order-first",
                            )}
                          >
                            {sorted === "asc" && (
                              <ChevronUp className="h-3 w-3" />
                            )}
                            {sorted === "desc" && (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            {!sorted && <ChevronsUpDown className="h-3 w-3" />}
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const subRow = renderSubRow ? renderSubRow(row) : null;
                const isExpandable = subRow !== null && row.getCanExpand();
                // Expanding stays the row's action where a sub-row exists.
                const activateRow = resolveRowActivation(
                  row,
                  isExpandable,
                  onRowClick,
                );
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={activateRow ? "cursor-pointer" : undefined}
                      tabIndex={activateRow ? 0 : undefined}
                      aria-expanded={
                        isExpandable ? row.getIsExpanded() : undefined
                      }
                      onClick={activateRow}
                      onKeyDown={
                        activateRow
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                activateRow();
                              }
                            }
                          : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {isExpandable && row.getIsExpanded() && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={columns.length} className="p-0">
                          {subRow}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <div className="pt-1">
          <DataTablePagination
            {...pagination}
            resultsLabel={resultsLabel}
            pageSizeLabel={pageSizeLabel}
            previousLabel={previousLabel}
            nextLabel={nextLabel}
          />
        </div>
      )}
    </div>
  );
}
