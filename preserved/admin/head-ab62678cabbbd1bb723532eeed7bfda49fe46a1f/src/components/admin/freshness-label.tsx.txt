import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  CircleX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FreshnessState = "fresh" | "stale" | "failed" | "unknown";

export type FreshnessLabelProps = {
  value: ReactNode;
  dateTime?: string;
  label?: ReactNode;
  state?: FreshnessState;
  stateLabel?: string;
  accessibleValue?: string;
  className?: string;
};

const freshnessConfig: Record<FreshnessState, {
  label: string;
  icon: LucideIcon;
  className: string;
}> = {
  fresh: {
    label: "최신",
    icon: CheckCircle2,
    className: "text-emerald-700 dark:text-emerald-300",
  },
  stale: {
    label: "지연",
    icon: AlertTriangle,
    className: "text-amber-700 dark:text-amber-300",
  },
  failed: {
    label: "실패",
    icon: CircleX,
    className: "text-destructive",
  },
  unknown: {
    label: "확인 필요",
    icon: CircleHelp,
    className: "text-muted-foreground",
  },
};

export function FreshnessLabel({
  value,
  dateTime,
  label = "마지막 갱신",
  state = "unknown",
  stateLabel,
  accessibleValue,
  className,
}: FreshnessLabelProps) {
  const config = freshnessConfig[state];
  const Icon = config.icon;
  const visibleState = stateLabel ?? config.label;
  const ariaLabel = accessibleValue
    ? `${typeof label === "string" ? label : "마지막 갱신"} ${accessibleValue}, 상태 ${visibleState}`
    : undefined;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-4",
        className,
      )}
      data-freshness={state}
      aria-label={ariaLabel}
    >
      <Icon className={cn("size-3.5 shrink-0", config.className)} aria-hidden="true" />
      <span className="text-muted-foreground">{label}</span>
      {dateTime ? (
        <time dateTime={dateTime} className="tabular font-medium text-foreground">
          {value}
        </time>
      ) : (
        <span className="tabular font-medium text-foreground">{value}</span>
      )}
      <span className={cn("font-medium", config.className)}>({visibleState})</span>
    </span>
  );
}
