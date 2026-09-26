export type ActiveUserDay = { date: string; dau: number; mau: number };

export type ActiveUserTrend = {
  generatedAt: string;
  today: string;
  trackingStartedOn: string | null;
  daily: ActiveUserDay[];
};

export type ActiveUserRange = "1m" | "3m" | "6m";

export const ACTIVE_USER_RANGE_DAYS: Record<ActiveUserRange, number> = { "1m": 30, "3m": 90, "6m": 180 };

export type ActiveUserSummary = {
  /** Today so far, in Korea time. */
  dau: number;
  mau: number;
  /** Average DAU over the MAU window ÷ MAU, in percent; null until someone is active. */
  stickiness: number | null;
  /** Change against yesterday; null when yesterday predates tracking. */
  dauDelta: number | null;
  mauDelta: number | null;
  /** Percentage points. */
  stickinessDelta: number | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseActiveUserTrend(value: unknown): ActiveUserTrend | null {
  if (!isRecord(value)) return null;
  const { generatedAt, today, trackingStartedOn, daily } = value;
  if (typeof generatedAt !== "string" || typeof today !== "string" || !DATE_PATTERN.test(today)) return null;
  if (trackingStartedOn !== null && (typeof trackingStartedOn !== "string" || !DATE_PATTERN.test(trackingStartedOn))) return null;
  if (!Array.isArray(daily)) return null;

  const days = daily.filter((day): day is ActiveUserDay => (
    isRecord(day)
    && typeof day.date === "string" && DATE_PATTERN.test(day.date)
    && isCount(day.dau) && isCount(day.mau)
  ));
  if (days.length !== daily.length) return null;

  return {
    generatedAt,
    today,
    trackingStartedOn,
    daily: days.map(({ date, dau, mau }) => ({ date, dau, mau })),
  };
}

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Days shown for a range, without the empty stretch before tracking began. */
export function visibleActiveUserDays(trend: ActiveUserTrend, range: ActiveUserRange) {
  const days = trend.daily.slice(-ACTIVE_USER_RANGE_DAYS[range]);
  const started = trend.trackingStartedOn;
  return started ? days.filter((day) => day.date >= started) : [];
}

// Daily DAU swings with weekends and today's partial count, so stickiness
// uses the average DAU across the same 30-day window MAU covers.
function stickinessOn(trend: ActiveUserTrend, day: ActiveUserDay) {
  if (day.mau === 0) return null;
  const started = trend.trackingStartedOn;
  const windowStart = shiftDate(day.date, -29);
  const windowDays = trend.daily.filter((candidate) => (
    candidate.date >= windowStart && candidate.date <= day.date && (!started || candidate.date >= started)
  ));
  const averageDau = windowDays.reduce((total, candidate) => total + candidate.dau, 0) / Math.max(1, windowDays.length);
  return (averageDau / day.mau) * 100;
}

export function summarizeActiveUsers(trend: ActiveUserTrend): ActiveUserSummary {
  const latest = trend.daily.at(-1) ?? { date: trend.today, dau: 0, mau: 0 };
  const started = trend.trackingStartedOn;
  const candidate = trend.daily.at(-2);
  const previous = started && candidate && candidate.date >= started ? candidate : null;
  const stickiness = stickinessOn(trend, latest);
  const previousStickiness = previous ? stickinessOn(trend, previous) : null;
  return {
    dau: latest.dau,
    mau: latest.mau,
    stickiness,
    dauDelta: previous ? latest.dau - previous.dau : null,
    mauDelta: previous ? latest.mau - previous.mau : null,
    stickinessDelta: stickiness !== null && previousStickiness !== null ? stickiness - previousStickiness : null,
  };
}

/** Axis rounded up to the next 1, 2 or 5 × 10ⁿ step, with about `steps` gridlines. */
export function niceAxis(maximum: number, steps = 4) {
  if (maximum <= 0) return { max: steps, ticks: Array.from({ length: steps + 1 }, (_, index) => index) };
  const rough = maximum / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? rough);
  const count = Math.ceil(maximum / step);
  return {
    max: step * count,
    ticks: Array.from({ length: count + 1 }, (_, index) => index * step),
  };
}

/** Evenly spaced label indexes that always include the latest point. */
export function axisLabelIndexes(length: number, maximumLabels = 6) {
  if (length <= 0) return [];
  if (length <= maximumLabels) return Array.from({ length }, (_, index) => index);
  const interval = Math.ceil((length - 1) / (maximumLabels - 1));
  const indexes: number[] = [];
  for (let index = length - 1; index >= 0; index -= interval) indexes.unshift(index);
  return indexes;
}
