"use client";

import type { LegacyColumn } from "@tanstack/react-table/legacy";
import type { RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: {
  column: LegacyColumn<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) return <span>{title}</span>;
  const sorted = column.getIsSorted();
  return (
    <Button variant="ghost" size="sm" className={cn("-ml-2 h-8 px-2 text-[11px] text-muted-foreground", className)} onClick={() => column.toggleSorting(sorted === "asc")}>
      {title}
      {sorted === "desc" ? <ArrowDown className="size-3" /> : sorted === "asc" ? <ArrowUp className="size-3" /> : <ChevronsUpDown className="size-3" />}
    </Button>
  );
}
