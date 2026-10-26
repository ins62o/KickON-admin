import {adminApiUrl} from '../auth/api.ts';
import type { SupabaseClient } from "@supabase/supabase-js";
import {syncStateResult} from "../management/sync-model.ts";

export type Summary = { totalProfiles: number | null; failedSyncCount: number | null };
export type Metrics = { posts: number | null; attendances: number | null; openInquiries: number | null };
export type ProviderUsage = { unavailableReason?: "not_configured"; entity: string; allowance: number | null; remaining: number | null; used: number | null; rate: number | null; resetAt: string | null };
export type Day = { date: string; dau: number; mau: number };
export type Trend = { today: string | null; trackingStartedOn: string | null; daily: Day[] };
export type SyncRow = { sync_key: string; last_attempted_at: string | null; last_succeeded_at: string | null; last_error: string | null };
export type DashboardData = { summary: Summary; metrics: Metrics; trend: Trend; sync: SyncRow[]; provider: ProviderUsage; errors: { summary: boolean; metrics: boolean; trend: boolean; sync: boolean; provider: boolean } };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

export function parseSummary(value: unknown): Summary {
  const row = object(value);
  return { totalProfiles: count(row.totalProfiles), failedSyncCount: row.syncAvailable === true ? count(row.failedSyncCount) : null };
}

export function parseMetrics(value: unknown): Metrics {
  const row = object(value);
  return { posts: count(row.posts), attendances: count(row.attendances), openInquiries: count(row.openInquiries) };
}

export function parseProviderUsage(value: unknown, allowance: number | null, now = Date.now()): ProviderUsage {
  const limit = allowance !== null && count(allowance) !== null && allowance > 0 ? allowance : null;
  const rows = (Array.isArray(value) ? value : []).map(object).filter(row => row.requested_entity === "Fixture" && timestamp(row.observed_at) && Date.parse(row.observed_at as string) <= now).sort((a,b) => Date.parse(b.observed_at as string)-Date.parse(a.observed_at as string));
  const row=rows[0];
  const resets=row ? count(row.resets_in_seconds) : null;
  const resetAt=row && resets !== null ? Date.parse(row.observed_at as string)+resets*1000 : null;
  const remaining=row && resetAt !== null && resetAt > now ? count(row.remaining) : null;
  const used=remaining !== null && limit !== null && remaining <= limit ? limit-remaining : null;
  return {entity:"Fixture",allowance:limit,remaining,used,rate:used !== null && limit !== null ? used/limit*100 : null,resetAt:resetAt !== null ? new Date(resetAt).toISOString() : null};
}

export function parseTrend(value: unknown): Trend {
  const row = object(value);
  const days = new Map<string, Day>();
  for (const item of Array.isArray(row.daily) ? row.daily : []) {
    const day = object(item);
    const key = date(day.date), dau = count(day.dau), mau = count(day.mau);
    if (key && dau !== null && mau !== null && dau <= mau) days.set(key, { date: key, dau, mau });
  }
  return { today: date(row.today), trackingStartedOn: date(row.trackingStartedOn), daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

export function visibleDays(trend: Trend, period: number): Day[] {
  if (!trend.today || !trend.trackingStartedOn) return [];
  const start = new Date(Date.parse(trend.today) - (period - 1) * 86_400_000).toISOString().slice(0, 10);
  return trend.daily.filter(day => day.date >= start && day.date >= trend.trackingStartedOn! && day.date <= trend.today!);
}

export function activityRate(active: number | null, total: number | null): number | null {
  return active === null || total === null || total <= 0 || active < 0 || active > total ? null : active / total * 100;
}

export function syncStatus(row: Pick<SyncRow, "last_succeeded_at" | "last_error"> & Partial<Pick<SyncRow,"last_attempted_at">>): "error" | "normal" | "unknown" {
  const result=syncStateResult(row);
  return result.tone==='orange'?'error':result.tone==='green'?'normal':'unknown';
}

export async function readProviderUsage(client:SupabaseClient,allowance:number|null,environment?:"development"|"production",fetcher:typeof fetch=fetch):Promise<{provider:ProviderUsage;failed:boolean}>{
  let unavailableReason:ProviderUsage["unavailableReason"];
  if(environment){
    try{
      const session=await client.auth.getSession();
      if(!session.error&&session.data.session){
        const response=await fetcher(adminApiUrl('provider-usage'),{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.data.session.access_token}`},body:JSON.stringify({environment}),signal:AbortSignal.timeout(12000)});
        const payload=await response.json();
        if(response.ok){
          const provider=parseProviderUsage([payload.observation],allowance);
          if(provider.remaining!==null)return {provider,failed:false};
        }else if(payload?.code==="PROVIDER_USAGE_NOT_CONFIGURED")unavailableReason="not_configured";
      }
    }catch{/* A fresh recorded observation can still be used when live measurement is unavailable. */}
  }
  try{
    const {data,error}=await client.rpc("get_admin_provider_usage",{since_at:new Date(Date.now()-86400000).toISOString()}).eq("requested_entity","Fixture").order("observed_at",{ascending:false}).limit(1);
    const provider=parseProviderUsage(error?null:data,allowance);
    return {provider:provider.rate===null&&unavailableReason?{...provider,unavailableReason}:provider,failed:Boolean(error)};
  }catch{return {provider:{...parseProviderUsage(null,allowance),...(unavailableReason?{unavailableReason}:{})},failed:true};}
}

export async function readDashboard(client: SupabaseClient | null, allowance: number | null = null,environment?:"development"|"production"): Promise<DashboardData> {
  const result: DashboardData = { summary: parseSummary(null), metrics: parseMetrics(null), trend: parseTrend(null), sync: [], provider: parseProviderUsage(null, allowance), errors: { provider: true, summary: true, metrics: true, trend: true, sync: true } };
  if (!client) return result;
  // Keep each read independent so one unavailable endpoint does not erase the rest.
  await Promise.allSettled([
    (async () => {
      const usage=await readProviderUsage(client,allowance,environment);
      result.provider=usage.provider;
      result.errors.provider=usage.failed;
    })(),
    (async () => {
      const { data, error } = await client.rpc("admin_get_dashboard_summary");
      if (error) return;
      result.summary = parseSummary(data);
      result.errors.summary = result.summary.totalProfiles === null;
    })(),
    (async () => {
      const { data, error } = await client.rpc("admin_get_dashboard_metrics");
      if (error) return;
      result.metrics = parseMetrics(data);
      result.errors.metrics = Object.values(result.metrics).some(value => value === null);
    })(),
    (async () => {
      const { data, error } = await client.rpc("admin_get_active_user_trend");
      if (error) return;
      result.trend = parseTrend(data);
      result.errors.trend = !result.trend.today;
    })(),
    (async () => {
      const { data, error } = await client.from("football_sync_state").select("sync_key,last_attempted_at,last_succeeded_at,last_error").order("last_attempted_at", { ascending: false, nullsFirst: false }).limit(8);
      if (error || !Array.isArray(data)) return;
      result.sync = data.filter(row => typeof row.sync_key === "string").map(row => ({ sync_key: row.sync_key, last_attempted_at: timestamp(row.last_attempted_at), last_succeeded_at: timestamp(row.last_succeeded_at), last_error: typeof row.last_error === "string" ? row.last_error : null }));
      result.errors.sync = false;
    })(),
  ]);
  return result;
}
