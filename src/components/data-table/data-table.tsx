"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type SortingState,
  type RowData,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableFilter = {
  columnId: string;
  label: string;
  allLabel?: string;
  allIcon?: ReactNode;
  options: Array<{ label: string; value: string; icon?: ReactNode; group?: string }>;
};

type DataTableProps<TData extends RowData> = {
  columns: LegacyColumnDef<TData>[];
  data: TData[];
  headerTitle?: string;
  headerTitleId?: string;
  headerMeta?: ReactNode;
  showHeaderResultCount?: boolean;
  resetFiltersInHeader?: boolean;
  searchPlaceholder: string;
  searchColumnId: string;
  filters?: DataTableFilter[];
  emptyState?: ReactNode;
  pageSize?: number;
  hiddenColumns?: string[];
  getRowId?: (row: TData) => string;
  getRowHref?: (row: TData) => string;
  comfortableToolbar?: boolean;
  alignFiltersEnd?: boolean;
  showResultCount?: boolean;
  comfortableRows?: boolean;
  columnWidths?: Record<string, string>;
  compactOnMobile?: boolean;
  renderMobileRow?: (row: TData) => ReactNode;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  headerTitle,
  headerTitleId,
  headerMeta,
  showHeaderResultCount = false,
  resetFiltersInHeader = false,
  searchPlaceholder,
  searchColumnId,
  filters = [],
  emptyState,
  pageSize = 25,
  hiddenColumns = [],
  getRowId,
  getRowHref,
  comfortableToolbar = false,
  alignFiltersEnd = false,
  showResultCount = true,
  comfortableRows = false,
  columnWidths,
  compactOnMobile = false,
  renderMobileRow,
}: DataTableProps<TData>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility] = useState<ColumnVisibilityState>(() => Object.fromEntries(hiddenColumns.map((columnId) => [columnId, false])));
  const table = useLegacyTable({
    data,
    columns,
    getRowId,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });
  const hasFilters = columnFilters.length > 0;

  return (
    <div className="min-w-0">
      {headerTitle ? (
        <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
          <h2 id={headerTitleId} className="text-base font-semibold">{headerTitle}</h2>
          <div className="flex shrink-0 items-center gap-3">
            {resetFiltersInHeader && hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 cursor-pointer px-2.5 text-sm text-muted-foreground"
                onClick={() => table.resetColumnFilters()}
              >
                <X className="size-3.5" /> 필터 초기화
              </Button>
            ) : null}
            {headerMeta}
            {showHeaderResultCount ? (
              <span className="tabular text-sm text-muted-foreground">
                {table.getFilteredRowModel().rows.length.toLocaleString("ko-KR")}건
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 border-b border-border/70 p-3 lg:flex-row lg:items-center">
        <SearchInput
          containerClassName="flex-1 lg:max-w-sm"
          value={(table.getColumn(searchColumnId)?.getFilterValue() as string) ?? ""}
          onChange={(event) => table.getColumn(searchColumnId)?.setFilterValue(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        <div className={cn(
          compactOnMobile ? "grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center" : "flex flex-wrap items-center gap-2",
          alignFiltersEnd && "lg:ml-auto",
        )}>
          {filters.map((filter) => (
            <Select
              key={filter.columnId}
              value={(table.getColumn(filter.columnId)?.getFilterValue() as string) ?? "all"}
              onValueChange={(value) => table.getColumn(filter.columnId)?.setFilterValue(value === "all" ? undefined : value)}
            >
              <SelectTrigger
                size="sm"
                className={comfortableToolbar
                  ? cn("w-44", compactOnMobile && "w-full lg:w-44")
                  : "min-w-32"}
              >
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent
                position={comfortableToolbar ? "popper" : "item-aligned"}
                align={comfortableToolbar ? "start" : "center"}
                className={comfortableToolbar ? "w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl" : undefined}
              >
                <SelectItem value="all" className={comfortableToolbar ? "cursor-pointer py-2.5 pr-8 pl-2.5" : undefined}>
                  {filter.allIcon}
                  {filter.allLabel ?? `${filter.label}: 전체`}
                </SelectItem>
                {filter.options.some((option) => option.group) ? (
                  Array.from(new Set(filter.options.map((option) => option.group).filter((group): group is string => Boolean(group)))).map((group, index) => (
                    <SelectGroup key={group}>
                      {index > 0 ? <SelectSeparator /> : null}
                      <SelectLabel className="px-2.5 py-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">{group}</SelectLabel>
                      {filter.options.filter((option) => option.group === group).map((option) => (
                        <SelectItem key={option.value} value={option.value} className={comfortableToolbar ? "cursor-pointer py-2.5 pr-8 pl-2.5" : undefined}>
                          {option.icon}
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                ) : filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value} className={comfortableToolbar ? "cursor-pointer py-2.5 pr-8 pl-2.5" : undefined}>
                    {option.icon}
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {hasFilters && !resetFiltersInHeader ? (
            <Button
              variant="ghost"
              size="sm"
              className={comfortableToolbar ? cn("h-11 rounded-xl px-3 text-sm text-muted-foreground", compactOnMobile && "col-span-2 lg:col-span-1") : "h-9 text-xs text-muted-foreground"}
              onClick={() => table.resetColumnFilters()}
            >
              <X className="size-3.5" /> 필터 초기화
            </Button>
          ) : null}
        </div>
        {showResultCount ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{table.getFilteredRowModel().rows.length.toLocaleString("ko-KR")}건</span>
        ) : null}
      </div>

      {renderMobileRow ? (
        <div className="divide-y divide-border/70 md:hidden">
          {table.getRowModel().rows.length > 0
            ? table.getRowModel().rows.map((row) => (
                <div key={row.id}>{renderMobileRow(row.original)}</div>
              ))
            : <div className="flex min-h-48 items-center justify-center px-4 text-center text-sm text-muted-foreground">{emptyState ?? "조건에 맞는 데이터가 없습니다."}</div>}
        </div>
      ) : null}

      <div className={renderMobileRow ? "hidden overflow-x-auto md:block" : "overflow-x-auto"}>
        <Table className={cn("min-w-[980px]", columnWidths && "table-fixed")}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={comfortableRows
                      ? cn("h-12 whitespace-nowrap text-sm font-semibold", columnWidths?.[header.column.id])
                      : cn("h-10 whitespace-nowrap text-[11px] font-medium", columnWidths?.[header.column.id])}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={getRowHref ? "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : undefined}
                onClick={getRowHref ? (event) => {
                  if ((event.target as HTMLElement).closest("a, button, input, select, [role='button']")) return;
                  router.push(getRowHref(row.original));
                } : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={comfortableRows
                      ? cn("py-4 text-sm", columnWidths?.[cell.column.id])
                      : cn("py-2.5 text-xs", columnWidths?.[cell.column.id])}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className="h-64 text-center text-sm text-muted-foreground">{emptyState ?? "조건에 맞는 데이터가 없습니다."}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t border-border/70 px-3 py-3">
        <p className="text-[11px] text-muted-foreground">
          {table.getFilteredRowModel().rows.length === 0 ? "0" : table.getState().pagination.pageIndex * pageSize + 1}
          -{Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getFilteredRowModel().rows.length)} / {table.getFilteredRowModel().rows.length}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="이전 페이지"><ChevronLeft className="size-4" /></Button>
          <span className="min-w-16 text-center text-xs text-muted-foreground">{table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}</span>
          <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="다음 페이지"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}
