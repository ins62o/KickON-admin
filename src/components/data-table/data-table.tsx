"use client";

import { useState, type ReactNode } from "react";
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
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type DataTableFilter = {
  columnId: string;
  label: string;
  options: Array<{ label: string; value: string }>;
};

type DataTableProps<TData extends RowData> = {
  columns: LegacyColumnDef<TData>[];
  data: TData[];
  searchPlaceholder: string;
  searchColumnId: string;
  filters?: DataTableFilter[];
  emptyState?: ReactNode;
  pageSize?: number;
  hiddenColumns?: string[];
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchPlaceholder,
  searchColumnId,
  filters = [],
  emptyState,
  pageSize = 25,
  hiddenColumns = [],
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility] = useState<ColumnVisibilityState>(() => Object.fromEntries(hiddenColumns.map((columnId) => [columnId, false])));
  const table = useLegacyTable({
    data,
    columns,
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
      <div className="flex flex-col gap-2 border-b border-border/70 p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={(table.getColumn(searchColumnId)?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn(searchColumnId)?.setFilterValue(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 bg-background/60 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <Select
              key={filter.columnId}
              value={(table.getColumn(filter.columnId)?.getFilterValue() as string) ?? "all"}
              onValueChange={(value) => table.getColumn(filter.columnId)?.setFilterValue(value === "all" ? undefined : value)}
            >
              <SelectTrigger size="sm" className="h-9 min-w-32 bg-background/60"><SelectValue placeholder={filter.label} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{filter.label}: 전체</SelectItem>
                {filter.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => table.resetColumnFilters()}>
              <X className="size-3.5" /> 필터 초기화
            </Button>
          ) : null}
        </div>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{table.getFilteredRowModel().rows.length.toLocaleString("ko-KR")}건</span>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-10 whitespace-nowrap text-[11px] font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-2.5 text-xs">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
