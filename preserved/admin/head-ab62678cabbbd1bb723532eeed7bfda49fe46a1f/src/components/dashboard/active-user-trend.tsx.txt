"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ChartLine } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  axisLabelIndexes,
  niceAxis,
  summarizeActiveUsers,
  visibleActiveUserDays,
  type ActiveUserDay,
  type ActiveUserRange,
  type ActiveUserTrend,
} from "@/lib/admin/active-users";
import { buildDemoActiveUserTrend, type ActiveUserDemoScenario } from "@/lib/admin/active-users-demo";
import { getAdminActiveUserTrend } from "@/lib/admin/console-data";
import { useClientData } from "@/lib/client-data";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: Array<{ value: ActiveUserRange; label: string }> = [
  { value: "1m", label: "1개월" },
  { value: "3m", label: "3개월" },
  { value: "6m", label: "6개월" },
];

const SERIES = [
  { key: "dau", label: "하루 이용자", shortLabel: "하루", color: "var(--series-dau)" },
  { key: "mau", label: "한 달 이용자", shortLabel: "한 달", color: "var(--series-mau)" },
] as const;

const CHART_HEIGHT = 232;
const MARGIN = { top: 14, right: 72, bottom: 28, left: 44 };
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day, weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] };
}

function shortDate(date: string) {
  const { month, day } = dateParts(date);
  return `${month}/${day}`;
}

function longDate(date: string) {
  const { month, day, weekday } = dateParts(date);
  return `${month}월 ${day}일 (${weekday})`;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function LineKey({ color }: { color: string }) {
  return <span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}

function ChartTooltip({ x, width, title, rows }: {
  x: number;
  width: number;
  title: string;
  rows: Array<{ label: string; value: number; color: string }>;
}) {
  const alignRight = x > width / 2;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-32 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
      style={alignRight ? { right: width - x + 12 } : { left: x + 12 }}
    >
      <p className="text-muted-foreground">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <LineKey color={row.color} />
            <strong className="tabular font-semibold text-foreground">{formatNumber(row.value)}명</strong>
            <span className="text-muted-foreground">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useChartKeyboard(length: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    if (length === 0) return;
    const current = active ?? length - 1;
    const next = event.key === "ArrowLeft" ? current - 1
      : event.key === "ArrowRight" ? current + 1
        : event.key === "Home" ? 0
          : event.key === "End" ? length - 1
            : null;
    if (next === null) return;
    event.preventDefault();
    setActive(Math.min(length - 1, Math.max(0, next)));
  };
  return {
    active,
    setActive,
    focusProps: {
      tabIndex: 0,
      onKeyDown,
      onFocus: () => setActive((value) => value ?? length - 1),
      onBlur: () => setActive(null),
    },
  };
}

/** Spread end-of-line labels so near-equal series don't overlap. */
function spreadLabels(positions: number[], minimumGap: number, top: number, bottom: number) {
  const order = positions.map((y, index) => ({ y, index })).sort((left, right) => left.y - right.y);
  for (let index = 1; index < order.length; index += 1) {
    order[index].y = Math.max(order[index].y, order[index - 1].y + minimumGap);
  }
  const overflow = order.length ? order[order.length - 1].y - bottom : 0;
  if (overflow > 0) order.forEach((item) => { item.y -= overflow; });
  const result = [...positions];
  order.forEach((item) => { result[item.index] = Math.max(top, item.y); });
  return result;
}

function DailyTrendChart({ days }: { days: ActiveUserDay[] }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const { active, setActive, focusProps } = useChartKeyboard(days.length);
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const axis = niceAxis(Math.max(0, ...days.map((day) => day.mau)));
  const step = days.length > 1 ? plotWidth / (days.length - 1) : 0;
  const x = (index: number) => MARGIN.left + (days.length > 1 ? index * step : plotWidth / 2);
  const y = (value: number) => MARGIN.top + plotHeight * (1 - value / axis.max);
  const latest = days.at(-1);
  const labelY = latest
    ? spreadLabels(SERIES.map((series) => y(latest[series.key])), 14, MARGIN.top + 4, MARGIN.top + plotHeight)
    : [];

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - bounds.left;
    setActive(days.length > 1 ? Math.min(days.length - 1, Math.max(0, Math.round(offset / step))) : 0);
  };
  const activeDay = active === null ? null : days[active];

  return (
    <div
      ref={containerRef}
      className="relative rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ height: CHART_HEIGHT }}
      role="group"
      aria-label="날짜별 이용자 수 그래프, 좌우 방향키로 날짜 이동"
      {...focusProps}
    >
      {width > 0 ? (
        <svg width={width} height={CHART_HEIGHT} className="block" aria-hidden="true">
          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? "stroke-border" : "stroke-border/50"}
                strokeDasharray={tick === 0 ? undefined : "2 4"}
              />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                {formatNumber(tick)}
              </text>
            </g>
          ))}

          {axisLabelIndexes(days.length, Math.min(6, Math.max(2, Math.floor(plotWidth / 56)))).map((index) => (
            <text
              key={days[index].date}
              x={x(index)}
              y={CHART_HEIGHT - 8}
              textAnchor={days.length > 1 && index === days.length - 1 ? "end" : days.length > 1 && index === 0 ? "start" : "middle"}
              className="fill-muted-foreground font-mono text-[10px]"
            >
              {shortDate(days[index].date)}
            </text>
          ))}

          {SERIES.map((series) => (
            days.length > 1 ? (
              <path
                key={series.key}
                d={days.map((day, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(day[series.key]).toFixed(1)}`).join("")}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <circle key={series.key} cx={x(0)} cy={y(days[0][series.key])} r={4} fill={series.color} className="stroke-card" strokeWidth={2} />
            )
          ))}

          {latest ? SERIES.map((series, index) => (
            <g key={series.key} transform={`translate(${MARGIN.left + plotWidth + 8}, ${labelY[index]})`}>
              <line x1={0} x2={8} y1={0} y2={0} stroke={series.color} strokeWidth={2} strokeLinecap="round" />
              <text x={12} dy="0.32em" className="fill-foreground text-[10px] font-semibold">{series.shortLabel}</text>
              <text x={40} dy="0.32em" className="tabular fill-muted-foreground text-[10px]">{formatNumber(latest[series.key])}</text>
            </g>
          )) : null}

          {activeDay && active !== null ? (
            <g>
              <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} className="stroke-muted-foreground/60" strokeWidth={1} />
              {SERIES.map((series) => (
                <circle key={series.key} cx={x(active)} cy={y(activeDay[series.key])} r={4} fill={series.color} className="stroke-card" strokeWidth={2} />
              ))}
            </g>
          ) : null}

          <rect
            x={MARGIN.left - (step / 2)}
            y={0}
            width={plotWidth + step}
            height={CHART_HEIGHT}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      ) : null}

      {activeDay && active !== null ? (
        <ChartTooltip
          x={x(active)}
          width={width}
          title={longDate(activeDay.date)}
          rows={SERIES.map((series) => ({ label: series.label, value: activeDay[series.key], color: series.color }))}
        />
      ) : null}

      <table className="sr-only">
        <caption>날짜별 하루 이용자와 한 달 이용자</caption>
        <thead><tr><th>날짜</th><th>하루 이용자</th><th>한 달 이용자</th></tr></thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}><th>{longDate(day.date)}</th><td>{day.dau}</td><td>{day.mau}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayOverDay({ delta, unit, decimals = 0 }: { delta: number | null; unit: string; decimals?: number }) {
  if (delta === null) return null;
  const rounded = Number(delta.toFixed(decimals));
  const text = `${decimals ? Math.abs(rounded).toFixed(decimals) : formatNumber(Math.abs(rounded))}${unit}`;
  const label = rounded > 0 ? `어제보다 ${text} 늘었어요` : rounded < 0 ? `어제보다 ${text} 줄었어요` : "어제와 같아요";
  return (
    <span
      className={cn(
        "tabular shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
        rounded > 0 && "border-info/30 bg-info/10 text-info",
        rounded < 0 && "border-danger/30 bg-danger/10 text-danger",
        rounded === 0 && "border-border bg-muted/50 text-muted-foreground",
      )}
      title={label}
      aria-label={label}
    >
      {rounded > 0 ? "+" : rounded < 0 ? "-" : ""}{text}
    </span>
  );
}

function StatTile({ label, hint, value, delta, color, className }: {
  label: string;
  hint?: string;
  value: string;
  delta?: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-3.5", className)}>
      <p className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground">
        {color ? <LineKey color={color} /> : null}
        {label}
        {hint ? <span className="text-muted-foreground/60">{hint}</span> : null}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="tabular text-2xl font-bold tracking-tight text-foreground">{value}</p>
        {delta}
      </div>
    </div>
  );
}

function EmptyChart({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ActiveUserTrendBody({ trend, range }: { trend: ActiveUserTrend; range: ActiveUserRange }) {
  if (!trend.trackingStartedOn) {
    return (
      <EmptyChart
        title="아직 쌓인 기록이 없습니다"
        description="앱 업데이트가 배포되면 그날부터 앱을 연 사람 수가 쌓입니다."
      />
    );
  }

  const summary = summarizeActiveUsers(trend);
  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-border/70">
        <div className="grid grid-cols-2 gap-px md:grid-cols-3">
          <StatTile
            label="하루 이용자"
            hint="DAU"
            color="var(--series-dau)"
            value={`${formatNumber(summary.dau)}명`}
            delta={<DayOverDay delta={summary.dauDelta} unit="명" />}
          />
          <StatTile
            label="한 달 이용자"
            hint="MAU"
            color="var(--series-mau)"
            value={`${formatNumber(summary.mau)}명`}
            delta={<DayOverDay delta={summary.mauDelta} unit="명" />}
          />
          <StatTile
            className="col-span-2 md:col-span-1"
            label="매일 오는 비율"
            hint="DAU/MAU"
            value={summary.stickiness === null ? "-" : `${summary.stickiness.toFixed(1)}%`}
            delta={<DayOverDay delta={summary.stickinessDelta} unit="%" decimals={1} />}
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SERIES.map((series) => (
            <span key={series.key} className="flex items-center gap-1.5"><LineKey color={series.color} />{series.label}</span>
          ))}
        </div>
        <DailyTrendChart days={visibleActiveUserDays(trend, range)} />
      </div>
    </>
  );
}

// Development-only preview with simulated members: `/?demo=active-users` or `/?demo=active-users-new`.
function useDemoScenario(): ActiveUserDemoScenario | null {
  const demo = useSearchParams().get("demo");
  if (process.env.NODE_ENV === "production") return null;
  return demo === "active-users" ? "growing" : demo === "active-users-new" ? "new" : null;
}

export function ActiveUserTrendSection() {
  const [range, setRange] = useState<ActiveUserRange>("1m");
  const demoScenario = useDemoScenario();
  const { data, error, loading } = useClientData(
    async () => demoScenario
      ? { status: "ready" as const, trend: buildDemoActiveUserTrend(demoScenario) }
      : getAdminActiveUserTrend(),
    [demoScenario],
  );

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="active-users-title">
      <header className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <ChartLine className="size-4" aria-hidden="true" />
          </span>
          <h2 id="active-users-title" className="whitespace-nowrap text-base font-semibold">앱 이용자 수</h2>
          {demoScenario ? (
            <span className="shrink-0 whitespace-nowrap rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">가짜 데이터</span>
          ) : null}
        </div>
        <Tabs value={range} onValueChange={(value) => setRange(value as ActiveUserRange)}>
          <TabsList
            aria-label="이용자 수 기간"
            className="grid! h-9! w-full grid-cols-3 gap-1 rounded-lg border border-border/80 bg-card/45 p-1 sm:w-auto"
          >
            {RANGE_OPTIONS.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="h-full! cursor-pointer rounded-md border-transparent px-3.5 text-xs font-semibold text-muted-foreground not-data-active:hover:bg-muted/40 not-data-active:hover:text-foreground data-active:border-transparent data-active:bg-primary/10 data-active:text-primary data-active:shadow-none data-active:ring-1 data-active:ring-inset data-active:ring-primary/20 dark:data-active:border-transparent dark:data-active:bg-primary/10 dark:data-active:text-primary sm:min-w-16"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <div className="p-3 sm:p-5">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : error || !data ? (
          <EmptyChart title="이용자 수를 불러오지 못했습니다" description={error ?? "잠시 후 다시 시도해 주세요."} />
        ) : data.status !== "ready" ? (
          <EmptyChart
            title={data.status === "not-ready" ? "아직 준비 중입니다" : "이용자 수를 불러오지 못했습니다"}
            description={data.message}
          />
        ) : (
          <ActiveUserTrendBody trend={data.trend} range={range} />
        )}
      </div>
    </section>
  );
}
