export type ProviderUsageTrendRange = "24h" | "7d" | "30d";

export type ProviderUsageTrendBucket = {
  at: string;
  label: string;
  requests: number;
  failures: number;
};

export type ProviderUsageTrendSeries = Record<ProviderUsageTrendRange, ProviderUsageTrendBucket[]>;

type UsageEvent = {
  observed_at: string;
  status_code: number;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const KOREA_OFFSET_MS = 9 * HOUR_MS;

function floorUtcHour(value: number) {
  return Math.floor(value / HOUR_MS) * HOUR_MS;
}

function floorKoreaDay(value: number) {
  return Math.floor((value + KOREA_OFFSET_MS) / DAY_MS) * DAY_MS - KOREA_OFFSET_MS;
}

function hourLabel(value: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function dayLabel(value: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function createBuckets(count: number, endAt: number, step: number, label: (value: number) => string) {
  const startAt = endAt - (count - 1) * step;
  return Array.from({ length: count }, (_, index): ProviderUsageTrendBucket => {
    const at = startAt + index * step;
    return { at: new Date(at).toISOString(), label: label(at), requests: 0, failures: 0 };
  });
}

function fillBuckets(
  buckets: ProviderUsageTrendBucket[],
  events: UsageEvent[],
  bucketStart: (value: number) => number,
  now: number,
) {
  const indexByStart = new Map(buckets.map((bucket, index) => [new Date(bucket.at).getTime(), index]));

  for (const event of events) {
    const observedAt = new Date(event.observed_at).getTime();
    if (!Number.isFinite(observedAt) || observedAt > now) continue;
    const index = indexByStart.get(bucketStart(observedAt));
    if (index === undefined) continue;
    buckets[index].requests += 1;
    if (event.status_code >= 400) buckets[index].failures += 1;
  }

  return buckets;
}

export function buildProviderUsageTrends(events: UsageEvent[], now = new Date()): ProviderUsageTrendSeries {
  const nowMs = now.getTime();
  const currentHour = floorUtcHour(nowMs);
  const currentKoreaDay = floorKoreaDay(nowMs);

  return {
    "24h": fillBuckets(createBuckets(24, currentHour, HOUR_MS, hourLabel), events, floorUtcHour, nowMs),
    "7d": fillBuckets(createBuckets(7, currentKoreaDay, DAY_MS, dayLabel), events, floorKoreaDay, nowMs),
    "30d": fillBuckets(createBuckets(30, currentKoreaDay, DAY_MS, dayLabel), events, floorKoreaDay, nowMs),
  };
}
