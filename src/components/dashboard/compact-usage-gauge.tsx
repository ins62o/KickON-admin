import type { LucideIcon } from "lucide-react";

import {
  AdminStatusBadge,
  type AdminStatusTone,
} from "@/components/admin/status-badge";
import type { HealthStatus } from "@/lib/data/types";

export type CompactUsageGaugeProps = {
  title: string;
  icon: LucideIcon;
  centerValue: string;
  rate: number | null;
  status: HealthStatus;
  note: string;
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
}: CompactUsageGaugeProps) {
  const color = gaugeColor(status);
  const normalizedRate = rate === null ? null : Math.min(100, Math.max(0, rate));
  const filledDegrees = normalizedRate === null
    ? 0
    : Math.round((normalizedRate / 100) * 270);

  return (
    <article className="flex min-h-72 flex-col bg-card px-4 py-5 sm:px-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h3 className="truncate text-sm font-semibold">{title}</h3>
        </div>
        <AdminStatusBadge
          className="self-center"
          label={statusLabel[status]}
          tone={statusTone[status]}
        />
      </header>

      <div className="flex flex-1 items-center justify-center py-4">
        <div
          className="relative size-44 rounded-full"
          style={{
            background: `conic-gradient(from 225deg, ${color} 0deg ${filledDegrees}deg, var(--gauge-track) ${filledDegrees}deg 270deg, transparent 270deg 360deg)`,
          }}
          role="img"
          aria-label={normalizedRate === null
            ? `${title} 사용률을 계산할 수 없음`
            : `${title} 사용률 ${normalizedRate.toFixed(1)}퍼센트`}
        >
          <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-card text-center">
            <p className="tabular max-w-32 truncate text-2xl font-bold tracking-[-0.04em]">
              {centerValue}
            </p>
            <p className="tabular mt-2.5 text-sm font-semibold" style={{ color }}>
              {normalizedRate === null ? "사용률 계산 필요" : `${normalizedRate.toFixed(1)}% 사용`}
            </p>
          </div>
        </div>
      </div>

      <p className="truncate border-t border-border/70 pt-3 text-center text-xs text-muted-foreground">
        {note}
      </p>
    </article>
  );
}
