import type { LucideIcon } from "lucide-react";

import {
  AdminStatusBadge,
  type AdminStatusTone,
} from "@/components/admin/status-badge";
import type { HealthStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export type CompactUsageGaugeProps = {
  title: string;
  icon: LucideIcon;
  centerValue: string;
  rate: number | null;
  status: HealthStatus;
  note: string;
  rateLabel?: string;
  rateSuffix?: string;
  compactOnMobile?: boolean;
  className?: string;
};

const statusLabel: Record<HealthStatus, string> = {
  normal: "정상",
  warning: "주의",
  danger: "한도 임박",
  unknown: "확인 필요",
};

const statusTone: Record<HealthStatus, AdminStatusTone> = {
  normal: "success",
  warning: "warning",
  danger: "danger",
  unknown: "neutral",
};

function gaugeColor(status: HealthStatus) {
  if (status === "danger") return "var(--gauge-danger)";
  if (status === "warning") return "var(--gauge-warning)";
  return "var(--gauge-normal)";
}

export function CompactUsageGauge({
  title,
  icon: Icon,
  centerValue,
  rate,
  status,
  note,
  rateLabel = "사용률",
  rateSuffix = "사용",
  compactOnMobile = false,
  className,
}: CompactUsageGaugeProps) {
  const color = gaugeColor(status);
  const normalizedRate = rate === null ? null : Math.min(100, Math.max(0, rate));
  const filledDegrees = normalizedRate === null
    ? 0
    : Math.round((normalizedRate / 100) * 270);
  const startCapColor = normalizedRate !== null && normalizedRate > 0
    ? color
    : "var(--gauge-track)";
  const endCapColor = normalizedRate === 100
    ? color
    : "var(--gauge-track)";

  return (
    <article className={cn("flex min-h-72 flex-col bg-card px-4 py-5 sm:px-5", compactOnMobile && "min-h-44 p-3.5 md:min-h-72 md:px-5 md:py-5", className)}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h3 className={cn("truncate text-sm font-semibold", compactOnMobile && "hidden md:block")}>{title}</h3>
        </div>
        <AdminStatusBadge
          className="self-center"
          label={statusLabel[status]}
          tone={statusTone[status]}
        />
      </header>

      {compactOnMobile ? <>
        <div className="mt-3 min-w-0 md:hidden">
          <h3 className="line-clamp-2 h-8 text-xs leading-4 font-semibold text-muted-foreground">{title}</h3>
          <p className="tabular flex h-8 items-center truncate text-xl font-bold tracking-tight text-foreground">{centerValue}</p>
        </div>
        <div className="mt-auto min-h-11 border-t border-border/70 pt-3 md:hidden">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-muted-foreground">{note}</span>
            <strong className="tabular shrink-0 font-semibold" style={{ color }}>{normalizedRate === null ? "계산 필요" : `${normalizedRate.toFixed(1)}%`}</strong>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--gauge-track)]" role="progressbar" aria-label={`${title} ${rateLabel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalizedRate ?? undefined}>
            <span className="block h-full rounded-full" style={{ width: `${normalizedRate ?? 0}%`, backgroundColor: color }} />
          </div>
        </div>
      </> : null}

      <div className={cn("flex flex-1 items-center justify-center py-4", compactOnMobile && "hidden md:flex")}>
        <div
          className="relative size-44 rounded-full"
          style={{
            background: `conic-gradient(from 225deg, ${color} 0deg ${filledDegrees}deg, var(--gauge-track) ${filledDegrees}deg 270deg, transparent 270deg 360deg)`,
          }}
          role="img"
          aria-label={normalizedRate === null
            ? `${title} ${rateLabel}을 계산할 수 없음`
            : `${title} ${rateLabel} ${normalizedRate.toFixed(1)}퍼센트`}
        >
          <span
            className="pointer-events-none absolute top-[82.2%] left-[17.8%] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: startCapColor }}
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute top-[82.2%] right-[17.8%] size-4 translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: endCapColor }}
            aria-hidden="true"
          />
          <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-card text-center">
            <p className="tabular max-w-32 truncate text-2xl font-bold tracking-[-0.04em]">
              {centerValue}
            </p>
            <p className="tabular mt-2.5 text-sm font-semibold" style={{ color }}>
              {normalizedRate === null ? `${rateLabel} 계산 필요` : `${normalizedRate.toFixed(1)}% ${rateSuffix}`}
            </p>
          </div>
        </div>
      </div>

      <p className={cn("truncate border-t border-border/70 pt-3 text-center text-xs text-muted-foreground", compactOnMobile && "hidden md:block")}>
        {note}
      </p>
    </article>
  );
}
