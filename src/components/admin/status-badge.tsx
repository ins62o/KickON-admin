import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminStatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type AdminStatusBadgeSize = "compact" | "default";

export type AdminStatusBadgeProps = {
  children?: ReactNode;
  label?: ReactNode;
  tone?: AdminStatusTone;
  size?: AdminStatusBadgeSize;
  icon?: LucideIcon;
  ariaLabel?: string;
  title?: string;
  className?: string;
};

const toneClass: Record<AdminStatusTone, string> = {
  neutral: "border-border bg-muted/65 text-muted-foreground",
  info: "border-primary/25 bg-primary/10 text-primary",
  success:
    "border-emerald-700/20 bg-emerald-600/[0.08] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
  warning:
    "border-amber-700/20 bg-amber-600/[0.08] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
};

const sizeClass: Record<AdminStatusBadgeSize, string> = {
  compact: "h-6 gap-1 px-1.5 text-[11px]",
  default: "h-7 gap-1.5 px-2 text-xs",
};

export function AdminStatusBadge({
  children,
  label,
  tone = "neutral",
  size = "compact",
  icon: Icon,
  ariaLabel,
  title,
  className,
}: AdminStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap",
        toneClass[tone],
        sizeClass[size],
        className,
      )}
      data-tone={tone}
      aria-label={ariaLabel}
      title={title}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden="true" /> : null}
      {children ?? label}
    </span>
  );
}
