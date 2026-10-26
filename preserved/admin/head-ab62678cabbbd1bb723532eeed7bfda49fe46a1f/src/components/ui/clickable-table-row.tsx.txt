"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ClickableTableRowProps = Omit<ComponentProps<typeof TableRow>, "onClick"> & {
  href: string;
};

export function ClickableTableRow({ href, children, className, ...props }: ClickableTableRowProps) {
  const router = useRouter();

  return (
    <TableRow
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input, select, [role='button']")) return;
        router.push(href);
      }}
      {...props}
    >
      {children}
    </TableRow>
  );
}
