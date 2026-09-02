import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetricTone = "neutral" | "accent" | "success" | "warning" | "danger";

export type MetricStripItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: MetricTone;
  status?: ReactNode;
};

export type MetricStripProps = {
  items: MetricStripItem[];
  ariaLabel?: string;
  className?: string;
  itemClassName?: string;
};

const iconToneClass: Record<MetricTone, string> = {
  neutral: "border-border/75 bg-background/55 text-muted-foreground",
  accent: "border-primary/25 bg-primary/10 text-primary",
  success:
    "border-emerald-700/20 bg-emerald-600/[0.08] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
  warning:
    "border-amber-700/20 bg-amber-600/[0.08] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
};

export function MetricStrip({
  items,
  ariaLabel = "핵심 지표",
  className,
  itemClassName,
}: MetricStripProps) {
  return (
    <dl
      className={cn(
        "metric-grid grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70",
        className,
      )}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const tone = item.tone ?? "neutral";

        return (
          <div
            key={item.id}
            className={cn("min-w-0 bg-card/45 p-4", itemClassName)}
            data-tone={tone}
          >
            <dt className="text-sm font-medium text-muted-foreground">
              {(Icon || item.status) ? (
                <span className="mb-4 flex min-h-8 items-start justify-between gap-3">
                  {Icon ? (
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md border",
                        iconToneClass[tone],
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="size-4" />
                    </span>
                  ) : <span />}
                  {item.status}
                </span>
              ) : null}
              <span className="block truncate">{item.label}</span>
            </dt>
            <dd className="tabular mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">
              {item.value}
            </dd>
            {item.detail ? (
              <dd className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                {item.detail}
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}
