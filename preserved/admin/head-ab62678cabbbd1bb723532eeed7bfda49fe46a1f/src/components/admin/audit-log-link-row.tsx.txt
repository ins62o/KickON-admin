"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

import { TableRow } from "@/components/ui/table";

export function AuditLogLinkRow({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const openDetail = () => router.push(href);

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openDetail();
  };

  return (
    <TableRow
      role="link"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      onClick={openDetail}
      onKeyDown={handleKeyDown}
    >
      {children}
    </TableRow>
  );
}
