import { Badge } from "@/components/ui/badge";
import type { HealthStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const statusConfig: Record<HealthStatus, { label: string; className: string }> = {
  normal: { label: "정상", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
  warning: { label: "주의", className: "border-amber-400/20 bg-amber-400/10 text-amber-300" },
  danger: { label: "위험", className: "border-rose-400/20 bg-rose-400/10 text-rose-300" },
  unknown: { label: "확인 필요", className: "border-border bg-muted text-muted-foreground" },
};

export function StatusBadge({ status, label }: { status: HealthStatus; label?: string }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 rounded-md px-2 text-xs font-medium", config.className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label ?? config.label}
    </Badge>
  );
}
