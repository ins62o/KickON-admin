"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ProviderUsageTrendRange,
  ProviderUsageTrendSeries,
} from "@/lib/data/provider-usage-trends";

const RANGE_OPTIONS: Array<{ value: ProviderUsageTrendRange; label: string; description: string }> = [
  { value: "24h", label: "24시간", description: "시간별" },
  { value: "7d", label: "7일", description: "일별" },
  { value: "30d", label: "30일", description: "일별" },
];

function shouldShowLabel(range: ProviderUsageTrendRange, index: number, length: number) {
  if (range === "7d") return true;
  if (range === "24h") return index % 4 === 0 || index === length - 1;
  return index % 5 === 0 || index === length - 1;
}

function barHeight(value: number, maximum: number) {
  if (value === 0) return 0;
  return Math.max(2, (value / maximum) * 136);
}

export function UsageTrendChart({ trends, connected }: { trends: ProviderUsageTrendSeries; connected: boolean }) {
  const [range, setRange] = useState<ProviderUsageTrendRange>("24h");
  const buckets = trends[range];
  const totalRequests = buckets.reduce((total, bucket) => total + bucket.requests, 0);
  const totalFailures = buckets.reduce((total, bucket) => total + bucket.failures, 0);
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.requests));
  const option = RANGE_OPTIONS.find((item) => item.value === range) ?? RANGE_OPTIONS[0];

  return (
    <section className="mt-6 rounded-xl border border-border/80 bg-card/35 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">외부 데이터 요청 추이</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            한국 시간 기준 {option.label} 동안 축구 데이터를 가져온 횟수와 실패를 {option.description}로 보여줍니다.
          </p>
        </div>
        <Tabs value={range} onValueChange={(value) => setRange(value as ProviderUsageTrendRange)}>
          <TabsList aria-label="사용량 그래프 기간">
            {RANGE_OPTIONS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {!connected ? (
        <div className="mt-5 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
          <p className="text-sm font-medium">요청 흐름을 아직 확인할 수 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">외부 데이터 사용 기록이 연결되면 기간별 변화가 표시됩니다.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between gap-4 border-b border-border/60 pb-3 text-xs">
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/75" />정상 처리</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-destructive/80" />실패</span>
            </div>
            <p className="tabular text-muted-foreground">
              가져옴 <strong className="font-semibold text-foreground">{totalRequests.toLocaleString("ko-KR")}</strong>회
              <span className="mx-1.5 text-border">/</span>
              실패 <strong className="font-semibold text-destructive">{totalFailures.toLocaleString("ko-KR")}</strong>회
            </p>
          </div>

          <div
            className="mt-4 grid h-44 items-end gap-1"
            style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
            aria-hidden="true"
          >
            {buckets.map((bucket, index) => {
              const successes = Math.max(0, bucket.requests - bucket.failures);
              const title = `${bucket.label}, 가져옴 ${bucket.requests}회, 실패 ${bucket.failures}회`;
              return (
                <div key={bucket.at} className="group flex min-w-0 flex-col items-center justify-end gap-2" title={title}>
                  <div className="flex h-36 w-full flex-col justify-end overflow-hidden rounded-sm bg-muted/35">
                    <div className="w-full bg-primary/75 transition-colors group-hover:bg-primary" style={{ height: `${barHeight(successes, maximum)}px` }} />
                    <div className="w-full bg-destructive/80" style={{ height: `${barHeight(bucket.failures, maximum)}px` }} />
                  </div>
                  <span className="h-3 truncate font-mono text-[9px] text-muted-foreground">
                    {shouldShowLabel(range, index, buckets.length) ? bucket.label : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {totalRequests === 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">선택한 기간에는 외부 데이터를 가져온 기록이 없습니다.</p>
          ) : null}

          <table className="sr-only">
            <caption>{option.label} 외부 데이터 요청량</caption>
            <thead><tr><th>구간</th><th>가져온 횟수</th><th>실패</th></tr></thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.at}><th>{bucket.label}</th><td>{bucket.requests}</td><td>{bucket.failures}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
