"use client";

import {
  Activity,
  CalendarDays,
  ChartNoAxesColumn,
  Clock3,
  Database,
  ExternalLink,
  FileUp,
  Gauge,
  HardDrive,
  Server,
  ShieldAlert,
} from "lucide-react";

import { DataState } from "@/components/admin/data-state";
import { DataManagementHeader } from "@/components/admin/data-management-header";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { SupabaseUsageCard } from "@/components/dashboard/supabase-usage-card";
import { UsageGaugeCard } from "@/components/dashboard/usage-gauge-card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { useClientData } from "@/lib/client-data";
import { getUsageSnapshotsClient } from "@/lib/data/client-usage";
import { formatBytes, formatKoreaDateTime, formatNumber, formatRelativeTime } from "@/lib/format";

function changeLabel(value: number | null) {
  if (value === null) return "비교 기준 없음";
  if (value === 0) return "변화 없음";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

export default function UsagePage() {
  const admin = useRequiredAdminPermission("system.read");
  const { data, error, loading, reload } = useClientData(getUsageSnapshotsClient);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "사용량 데이터를 확인할 수 없습니다."} retry={reload} />;
  const provider = data.sportsMonks;
  const hasProviderRows = provider.connected && (provider.recordCount ?? 0) > 0;
  const hourlyMaximum = Math.max(1, ...provider.trends["24h"].map((bucket) => bucket.requests));
  const storageTone = data.storageInsights.alertLevel === "위험"
    ? "danger"
    : data.storageInsights.alertLevel === "경고" || data.storageInsights.alertLevel === "주의"
      ? "warning"
      : data.storageInsights.alertLevel === "정상"
        ? "success"
        : "neutral";

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <DataManagementHeader role={admin.role} activeSection="usage" />

      <header className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-primary">SYSTEM</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">사용량 및 시스템 상태</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">DB와 파일 스토리지를 분리해 보고, SportsMonks 호출량과 서비스 상태를 함께 확인합니다.</p>
        </div>
        <p className="text-xs text-muted-foreground">{data.checkedAt ? `마지막 확인 ${formatRelativeTime(data.checkedAt)}` : "확인 기록 없음"}</p>
      </header>

      <section className="mt-6 grid gap-5 xl:grid-cols-2" aria-label="핵심 사용량">
        <SupabaseUsageCard database={data.database} storage={data.fileStorage} />
        <UsageGaugeCard eyebrow="SportsMonks" description="최근 60일 실제 호출 관측과 최신 quota 헤더를 기준으로 계산합니다." icon={Activity} {...data.provider} />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="provider-observations-title">
        <div className="border-b border-border/70 px-4 py-3.5">
          <h2 id="provider-observations-title" className="text-sm font-semibold">SportsMonks 호출 관측</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">최근 60일 football_provider_usage 기록만 집계하며 인증 토큰과 요청 헤더는 노출하지 않습니다.</p>
        </div>

        {provider.error ? (
          <DataState kind="unavailable" title="SportsMonks 사용 기록을 조회할 수 없습니다" description={provider.error} />
        ) : provider.recordCount === 0 ? (
          <DataState kind="empty" title="최근 60일 호출 기록이 없습니다" description="SportsMonks 서버 호출이 관측되면 엔티티 quota와 기간별 요청 수가 여기에 표시됩니다." />
        ) : hasProviderRows ? (
          <div className="p-4">
            {provider.truncated ? (
              <div className="mb-4 flex items-start gap-2 border border-amber-700/25 bg-amber-600/[0.08] px-3 py-2 text-xs text-amber-800 dark:text-amber-300" role="status">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                최근 관측 {formatNumber(provider.recordCount)}건이 조회 상한에 도달했습니다. 아래 합계는 반환된 실제 기록만 반영하며 60일 전체보다 작을 수 있습니다.
              </div>
            ) : null}

            <MetricStrip
              ariaLabel="SportsMonks 요청 지표"
              className="sm:grid-cols-2 xl:grid-cols-4"
              items={[
                { id: "today", label: "오늘 요청", value: `${formatNumber(provider.todayCount)}회`, detail: "한국 시간 00:00부터", icon: Clock3, tone: "accent" },
                { id: "month", label: "이번 달 요청", value: `${formatNumber(provider.monthCount)}회`, detail: "한국 시간 월초부터", icon: CalendarDays },
                { id: "rate-limit", label: "HTTP 429", value: `${formatNumber(provider.rateLimitedCount)}회`, detail: `4xx 전체 ${formatNumber(provider.clientErrorCount)}회`, icon: ShieldAlert, tone: (provider.rateLimitedCount ?? 0) > 0 ? "warning" : "success" },
                { id: "server-error", label: "HTTP 5xx", value: `${formatNumber(provider.serverErrorCount)}회`, detail: `60일 오류 전체 ${formatNumber(provider.failedCount)}회`, icon: Server, tone: (provider.serverErrorCount ?? 0) > 0 ? "danger" : "success" },
              ]}
            />

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <section className="overflow-hidden rounded-lg border border-border/70 bg-background/30" aria-labelledby="entity-quota-title">
                <div className="border-b border-border/70 px-3 py-3">
                  <h3 id="entity-quota-title" className="text-xs font-semibold">엔티티별 최신 quota</h3>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">각 requested_entity에서 가장 최근에 관측된 remaining과 reset입니다.</p>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[720px]">
                    <TableHeader><TableRow><TableHead>엔티티</TableHead><TableHead className="text-right">남은 요청</TableHead><TableHead>Reset</TableHead><TableHead>Source / Endpoint</TableHead><TableHead>관측</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {provider.entities.map((entity) => (
                        <TableRow key={entity.entity}>
                          <TableCell className="font-mono text-xs">{entity.entity}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{entity.remaining === null ? "-" : formatNumber(entity.remaining)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{entity.resetAt ? formatKoreaDateTime(entity.resetAt) : "미관측"}</TableCell>
                          <TableCell><p className="text-xs">{entity.source}</p><p className="mt-0.5 max-w-56 truncate font-mono text-[10px] text-muted-foreground">{entity.endpoint}</p></TableCell>
                          <TableCell><p className="text-xs text-muted-foreground">{formatRelativeTime(entity.observedAt)}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">HTTP {entity.statusCode}</p></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="rounded-lg border border-border/70 bg-background/30" aria-labelledby="provider-trend-title">
                <div className="border-b border-border/70 px-3 py-3">
                  <h3 id="provider-trend-title" className="text-xs font-semibold">최근 24시간 추이</h3>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">시간별 실제 요청 수와 오류 관측을 요약합니다.</p>
                </div>
                <dl className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
                  <div className="bg-card/50 p-3"><dt className="text-[10px] text-muted-foreground">최근 24시간</dt><dd className="mt-1 font-mono text-lg font-semibold">{formatNumber(provider.last24Hours.requests)}</dd></div>
                  <div className="bg-card/50 p-3"><dt className="text-[10px] text-muted-foreground">직전 24시간</dt><dd className="mt-1 font-mono text-lg font-semibold">{formatNumber(provider.last24Hours.previousRequests)}</dd></div>
                  <div className="bg-card/50 p-3"><dt className="text-[10px] text-muted-foreground">요청 증감</dt><dd className="mt-1 text-lg font-semibold">{changeLabel(provider.last24Hours.requestChangePercent)}</dd></div>
                  <div className="bg-card/50 p-3"><dt className="text-[10px] text-muted-foreground">오류</dt><dd className="mt-1 font-mono text-lg font-semibold">{formatNumber(provider.last24Hours.failures)}</dd></div>
                </dl>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                    <span>{provider.last24Hours.peakHourLabel ? `최다 ${provider.last24Hours.peakHourLabel} · ${formatNumber(provider.last24Hours.peakHourRequests)}회` : "최근 24시간 요청 없음"}</span>
                    <span>오류가 있는 시간은 빨간색</span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1">
                    <ol className="grid h-32 min-w-[680px] grid-cols-[repeat(24,minmax(20px,1fr))] items-end gap-1" aria-label="최근 24시간 시간별 SportsMonks 요청">
                      {provider.trends["24h"].map((bucket, index) => {
                        const height = bucket.requests === 0 ? 2 : Math.max(8, Math.round((bucket.requests / hourlyMaximum) * 100));
                        return (
                          <li key={bucket.at} className="flex h-full min-w-0 flex-col justify-end" title={`${bucket.label}: ${bucket.requests}회, 오류 ${bucket.failures}회`}>
                            <span className="sr-only">{bucket.label} 요청 {bucket.requests}회, 오류 {bucket.failures}회</span>
                            <span className={`block w-full rounded-t-sm ${bucket.failures > 0 ? "bg-destructive/80" : "bg-primary/70"}`} style={{ height: `${height}%` }} aria-hidden="true" />
                            <span className="mt-1 h-3 truncate text-center text-[8px] text-muted-foreground" aria-hidden="true">{index % 4 === 0 || index === 23 ? bucket.label : ""}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <section className="overflow-hidden rounded-lg border border-border/70 bg-background/30" aria-labelledby="endpoint-title">
                <div className="flex items-center gap-2 border-b border-border/70 px-3 py-3"><ExternalLink className="size-4 text-primary" aria-hidden="true" /><div><h3 id="endpoint-title" className="text-xs font-semibold">Source / Endpoint별 요청</h3><p className="mt-0.5 text-[10px] text-muted-foreground">최근 60일 관측을 호출 출처와 경로별로 묶었습니다.</p></div></div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Endpoint</TableHead><TableHead className="text-right">요청</TableHead><TableHead className="text-right">429</TableHead><TableHead className="text-right">4xx</TableHead><TableHead className="text-right">5xx</TableHead><TableHead>최근 관측</TableHead></TableRow></TableHeader>
                    <TableBody>{provider.sourceEndpoints.map((endpoint) => <TableRow key={endpoint.key}><TableCell className="text-xs">{endpoint.source}</TableCell><TableCell className="max-w-64 break-all font-mono text-[10px]">{endpoint.endpoint}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(endpoint.requests)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(endpoint.rateLimited)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(endpoint.clientErrors)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(endpoint.serverErrors)}</TableCell><TableCell className="text-xs text-muted-foreground">{formatRelativeTime(endpoint.lastObservedAt)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border/70 bg-background/30" aria-labelledby="provider-monthly-title">
                <div className="flex items-center gap-2 border-b border-border/70 px-3 py-3"><ChartNoAxesColumn className="size-4 text-primary" aria-hidden="true" /><div><h3 id="provider-monthly-title" className="text-xs font-semibold">최근 60일 월별 집계</h3><p className="mt-0.5 text-[10px] text-muted-foreground">월 전체가 아니라 60일 조회 범위에 포함된 기록의 합계입니다.</p></div></div>
                <Table>
                  <TableHeader><TableRow><TableHead>월</TableHead><TableHead className="text-right">요청</TableHead><TableHead className="text-right">오류</TableHead><TableHead className="text-right">429</TableHead><TableHead className="text-right">4xx</TableHead><TableHead className="text-right">5xx</TableHead></TableRow></TableHeader>
                  <TableBody>{provider.monthly.map((month) => <TableRow key={month.month}><TableCell className="text-xs font-medium">{month.label}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(month.requests)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(month.failures)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(month.rateLimited)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(month.clientErrors)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(month.serverErrors)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </section>
            </div>
          </div>
        ) : (
          <DataState kind="unavailable" title="SportsMonks 관측 상태를 확인할 수 없습니다" description="연결 상태를 확인한 뒤 다시 시도해 주세요." />
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="system-status-title">
        <div className="border-b border-border/70 px-4 py-3.5">
          <h2 id="system-status-title" className="text-sm font-semibold">구성 요소 상태</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">실제 쿼리와 최근 관측 기록으로 확인한 상태입니다.</p>
        </div>
        <div className="grid gap-px bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
          {data.systems.map((system) => (
            <article key={system.key} className="bg-card px-4 py-4">
              <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold">{system.label}</h3><StatusBadge status={system.status} /></div>
              <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{system.detail}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">{system.latencyMs === null ? system.source : `${formatNumber(system.latencyMs)}ms · ${system.source}`}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="supabase-detail-title">
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3.5"><Database className="size-4 text-primary" aria-hidden="true" /><h2 id="supabase-detail-title" className="text-sm font-semibold">Supabase 세부 지표</h2></div>
        <Table>
          <TableHeader><TableRow><TableHead>지표</TableHead><TableHead className="text-right">현재 값</TableHead><TableHead>상태</TableHead></TableRow></TableHeader>
          <TableBody>{data.supabaseDetails.infrastructure.map((metric) => <TableRow key={metric.key}><TableCell><p className="text-xs font-medium">{metric.label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{metric.detail}</p></TableCell><TableCell className="text-right font-mono text-xs">{metric.value === null ? "-" : metric.unit === "bytes" ? formatBytes(metric.value) : formatNumber(metric.value)}</TableCell><TableCell><StatusBadge status={metric.status === "available" ? "normal" : metric.status === "error" ? "danger" : "unknown"} /></TableCell></TableRow>)}</TableBody>
        </Table>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="storage-bucket-title">
        <div className="border-b border-border/70 px-4 py-3.5"><h2 id="storage-bucket-title" className="text-sm font-semibold">Storage 버킷별 사용량</h2><p className="mt-0.5 text-xs text-muted-foreground">버킷 집계에는 파일 경로를 포함하지 않고 객체 수와 실제 metadata.size 합계만 표시합니다.</p></div>
        {data.storageBuckets.rows.length > 0 ? <Table><TableHeader><TableRow><TableHead>버킷</TableHead><TableHead className="text-right">파일 수</TableHead><TableHead className="text-right">사용량</TableHead><TableHead className="text-right">크기 미측정</TableHead><TableHead>최근 업로드</TableHead></TableRow></TableHeader><TableBody>{data.storageBuckets.rows.map((bucket) => <TableRow key={bucket.bucketId}><TableCell className="font-mono text-xs">{bucket.bucketId}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(bucket.objectCount)}</TableCell><TableCell className="text-right font-mono text-xs">{formatBytes(bucket.usedBytes)}</TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(bucket.unmeasuredObjectCount)}</TableCell><TableCell className="text-xs text-muted-foreground">{bucket.newestObjectAt ? formatRelativeTime(bucket.newestObjectAt) : "파일 없음"}</TableCell></TableRow>)}</TableBody></Table> : <DataState kind="unavailable" title="버킷별 집계를 확인할 수 없습니다" description={data.storageBuckets.error} compact />}
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="storage-insight-title">
        <div className="border-b border-border/70 px-4 py-3.5">
          <h2 id="storage-insight-title" className="text-sm font-semibold">Storage 증가량과 큰 파일</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">서버 전용 Secret API key로 파일 목록을 합산합니다. 객체 경로는 이 관리자 화면에만 표시하며 로그에는 기록하지 않습니다.</p>
        </div>

        <div className="p-4">
          <MetricStrip
            ariaLabel="Storage 상세 사용량"
            className="sm:grid-cols-2 xl:grid-cols-4"
            items={[
              {
                id: "storage-month-bytes",
                label: "이번 달 업로드 용량",
                value: data.storageInsights.currentMonthUsedBytes === null ? "확인 필요" : formatBytes(data.storageInsights.currentMonthUsedBytes),
                detail: "한국 시간 월초 이후 생성된 객체",
                icon: FileUp,
                tone: "accent",
              },
              {
                id: "storage-month-objects",
                label: "이번 달 업로드 파일",
                value: data.storageInsights.currentMonthObjectCount === null ? "확인 필요" : `${formatNumber(data.storageInsights.currentMonthObjectCount)}개`,
                detail: "Storage object created_at 기준",
                icon: HardDrive,
              },
              {
                id: "storage-unmeasured",
                label: "크기 미측정 파일",
                value: data.storageInsights.unmeasuredObjectCount === null ? "확인 필요" : `${formatNumber(data.storageInsights.unmeasuredObjectCount)}개`,
                detail: "metadata.size가 없는 객체",
                icon: ShieldAlert,
                tone: (data.storageInsights.unmeasuredObjectCount ?? 0) > 0 ? "warning" : "success",
              },
              {
                id: "storage-alert",
                label: "무료 한도 경고 단계",
                value: data.storageInsights.alertLevel,
                detail: "70% 주의 · 85% 경고 · 95% 위험",
                icon: Gauge,
                tone: storageTone,
              },
            ]}
          />
        </div>

        {data.storageInsights.largestObjects.length > 0 ? (
          <div className="overflow-x-auto border-t border-border/70">
            <Table className="min-w-[920px]">
              <TableHeader><TableRow><TableHead>버킷</TableHead><TableHead>객체 경로</TableHead><TableHead className="text-right">크기</TableHead><TableHead>생성</TableHead><TableHead>최근 수정</TableHead></TableRow></TableHeader>
              <TableBody>{data.storageInsights.largestObjects.map((object) => (
                <TableRow key={`${object.bucketId}:${object.name}`}>
                  <TableCell className="font-mono text-xs">{object.bucketId}</TableCell>
                  <TableCell className="max-w-[34rem] break-all font-mono text-[10px]">{object.name}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatBytes(object.size)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatKoreaDateTime(object.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{object.updatedAt ? formatKoreaDateTime(object.updatedAt) : "기록 없음"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        ) : data.storageInsights.error ? (
          <DataState kind="unavailable" title="큰 파일 목록을 확인할 수 없습니다" description={data.storageInsights.error} compact />
        ) : (
          <DataState kind="empty" title="Storage에 저장된 파일이 없습니다" description="파일이 업로드되면 크기가 큰 순서로 최대 10개를 표시합니다." compact />
        )}
      </section>
    </div>
  );
}
