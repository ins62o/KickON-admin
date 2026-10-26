import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DashboardActionItem = {
  key: string;
  level: "danger" | "warning" | "info";
  title: string;
  description: string;
  href: string;
  actionLabel: string;
};

const levelConfig = {
  danger: { label: "먼저 확인", icon: ShieldAlert, className: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200" },
  warning: { label: "확인 필요", icon: TriangleAlert, className: "border-amber-400/20 bg-amber-400/[0.05] text-amber-100" },
  info: { label: "연결 확인", icon: CircleDashed, className: "border-border bg-card/45 text-foreground" },
} as const;

export function ActionCenter({ items }: { items: DashboardActionItem[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card/40" aria-labelledby="action-center-title">
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="action-center-title" className="text-sm font-semibold">지금 확인할 일</h2><p className="mt-0.5 text-xs text-muted-foreground">실제 운영 데이터에서 필요한 작업만 우선순위대로 표시합니다.</p></div>
        <Badge variant="outline" className="mt-2 w-fit rounded-md sm:mt-0">{items.length > 0 ? `${items.length}개 항목` : "긴급 항목 없음"}</Badge>
      </div>

      {items.length > 0 ? <div className="grid gap-px bg-border md:grid-cols-2">{items.map((item) => {
        const config = levelConfig[item.level];
        const Icon = config.icon;
        return <article key={item.key} className="flex min-w-0 items-start gap-3 bg-background/45 p-4"><div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", config.className)}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{item.title}</h3><span className={cn("text-[10px] font-medium", item.level === "danger" ? "text-rose-300" : item.level === "warning" ? "text-amber-300" : "text-muted-foreground")}>{config.label}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p><Button asChild variant="link" size="sm" className="mt-1 h-7 px-0 text-xs"><Link href={item.href}>{item.actionLabel} <ArrowRight className="size-3.5" /></Link></Button></div></article>;
      })}</div> : <div className="flex items-center gap-3 px-4 py-5"><div className="flex size-9 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"><CircleCheck className="size-4" /></div><div><p className="text-sm font-semibold">지금 바로 처리할 긴급 항목이 없습니다</p><p className="mt-0.5 text-xs text-muted-foreground">아래 상태 카드와 구단별 현황은 평소처럼 확인해 주세요.</p></div></div>}
    </section>
  );
}
