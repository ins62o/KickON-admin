"use client";

import type { LegacyColumn } from "@tanstack/react-table/legacy";
import type { RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DataTableColumnHeader<TData extends RowData, TValue>({ column, title }: { column: LegacyColumn<TData, TValue>; title: string }) {
  if (!column.getCanSort()) return <span>{title}</span>;
  const sorted = column.getIsSorted();
  return (
    <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-[11px] text-muted-foreground" onClick={() => column.toggleSorting(sorted === "asc")}>
      {title}
      {sorted === "desc" ? <ArrowDown className="size-3" /> : sorted === "asc" ? <ArrowUp className="size-3" /> : <ChevronsUpDown className="size-3" />}
    </Button>
  );
}
