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
  layout?: "stacked" | "inline";
  compactOnMobile?: boolean;
  centered?: boolean;
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
  layout = "stacked",
  compactOnMobile = false,
  centered = false,
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
            className={cn(
              "min-w-0 bg-card/45 p-4",
              layout === "inline" && "flex min-h-18 flex-wrap items-center justify-between gap-x-4 gap-y-2",
              compactOnMobile && layout === "stacked" && "p-2.5 text-center md:p-4 md:text-left",
              compactOnMobile && layout === "inline" && "p-3 md:p-4",
              centered && "flex flex-col items-center justify-center text-center md:text-center",
              itemClassName,
            )}
            data-tone={tone}
          >
            {layout === "inline" ? (
              <>
                <dt className={cn("flex min-w-0 items-center gap-3 text-base font-semibold text-foreground", compactOnMobile && "gap-2 text-sm md:gap-3 md:text-base")}>
                  {Icon ? (
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg border",
                        compactOnMobile && "size-8 rounded-md md:size-10 md:rounded-lg",
                        iconToneClass[tone],
                      )}
                      aria-hidden="true"
                    >
                      <Icon className={cn("size-5", compactOnMobile && "size-4 md:size-5")} />
                    </span>
                  ) : null}
                  <span className="truncate">{item.label}</span>
                </dt>
                <dd className={cn("tabular shrink-0 text-2xl font-semibold tracking-tight text-foreground", compactOnMobile && "text-xl md:text-2xl")}>
                  {item.value}
                </dd>
                {item.detail ? (
                  <dd className="line-clamp-2 w-full text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </dd>
                ) : null}
              </>
            ) : (
              <>
                <dt className={cn("text-sm font-medium text-muted-foreground", compactOnMobile && "text-[11px] md:text-sm")}>
                  {(Icon || item.status) ? (
                    <span className={cn("mb-4 flex min-h-8 items-start justify-between gap-3", compactOnMobile && "mb-3 min-h-7 justify-center md:mb-4 md:min-h-8 md:justify-between", centered && "justify-center md:justify-center")}>
                      {Icon ? (
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-md border",
                            compactOnMobile && "size-7 md:size-8",
                            iconToneClass[tone],
                          )}
                          aria-hidden="true"
                        >
                          <Icon className={cn("size-4", compactOnMobile && "size-3.5 md:size-4")} />
                        </span>
                      ) : <span />}
                      {item.status}
                    </span>
                  ) : null}
                  <span className="block truncate">{item.label}</span>
                </dt>
                <dd className={cn("tabular mt-1 truncate text-2xl font-semibold tracking-tight text-foreground", compactOnMobile && "text-lg md:text-2xl")}>
                  {item.value}
                </dd>
                {item.detail ? (
                  <dd className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </dd>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </dl>
  );
}
