// pg_cron evaluates five-field expressions in UTC (cron.timezone defaults to GMT).

type CronFields = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const SEARCH_DAYS = 400;
const KST_OFFSET_HOURS = 9;

function parseField(field: string, minimum: number, maximum: number): Set<number> | null {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const match = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!match) return null;
    const step = match[2] ? Number(match[2]) : 1;
    let start = minimum;
    let end = maximum;
    if (match[1] !== "*") {
      const [from, to] = match[1].split("-").map(Number);
      start = from;
      end = to ?? (match[2] ? maximum : from);
    }
    if (step < 1 || start < minimum || end > maximum || start > end) return null;
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

export function parseCronExpression(expression: string): CronFields | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minutes = parseField(fields[0], 0, 59);
  const hours = parseField(fields[1], 0, 23);
  const daysOfMonth = parseField(fields[2], 1, 31);
  const months = parseField(fields[3], 1, 12);
  const rawDaysOfWeek = parseField(fields[4], 0, 7);
  if (!minutes || !hours || !daysOfMonth || !months || !rawDaysOfWeek) return null;
  const daysOfWeek = new Set([...rawDaysOfWeek].map((day) => day % 7));
  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    dayOfMonthRestricted: fields[2] !== "*",
    dayOfWeekRestricted: fields[4] !== "*",
  };
}

function dayMatches(fields: CronFields, day: Date) {
  if (!fields.months.has(day.getUTCMonth() + 1)) return false;
  const dom = fields.daysOfMonth.has(day.getUTCDate());
  const dow = fields.daysOfWeek.has(day.getUTCDay());
  // Standard cron: when both day fields are restricted, either one matching is enough.
  if (fields.dayOfMonthRestricted && fields.dayOfWeekRestricted) return dom || dow;
  if (fields.dayOfMonthRestricted) return dom;
  if (fields.dayOfWeekRestricted) return dow;
  return true;
}

function sorted(values: Set<number>, descending = false) {
  return [...values].sort((left, right) => (descending ? right - left : left - right));
}

/** First scheduled minute strictly after `from`. */
export function nextCronOccurrence(expression: string, from: Date): Date | null {
  const fields = parseCronExpression(expression);
  if (!fields) return null;
  const start = new Date(Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS);
  const hours = sorted(fields.hours);
  const minutes = sorted(fields.minutes);
  const firstDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
    const day = new Date(firstDay + offset * DAY_MS);
    if (!dayMatches(fields, day)) continue;
    for (const hour of hours) {
      for (const minute of minutes) {
        const candidate = new Date(day.getTime() + hour * 3_600_000 + minute * MINUTE_MS);
        if (candidate >= start) return candidate;
      }
    }
  }
  return null;
}

/** Latest scheduled minute at or before `from`. */
export function previousCronOccurrence(expression: string, from: Date): Date | null {
  const fields = parseCronExpression(expression);
  if (!fields) return null;
  const end = new Date(Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS);
  const hours = sorted(fields.hours, true);
  const minutes = sorted(fields.minutes, true);
  const lastDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
    const day = new Date(lastDay - offset * DAY_MS);
    if (!dayMatches(fields, day)) continue;
    for (const hour of hours) {
      for (const minute of minutes) {
        const candidate = new Date(day.getTime() + hour * 3_600_000 + minute * MINUTE_MS);
        if (candidate <= end) return candidate;
      }
    }
  }
  return null;
}

/** Grace period after a scheduled minute before a run that never started counts as missed. */
const MISSED_RUN_GRACE_MS = 5 * MINUTE_MS;

/**
 * True when the most recent scheduled run (older than the grace period) has no
 * run that started at or after it. Unknown history or inactive jobs are never delayed.
 */
export function cronMissedLatestRun(expression: string, lastStartedAt: string | null, now: Date) {
  if (!lastStartedAt) return false;
  const expected = previousCronOccurrence(expression, new Date(now.getTime() - MISSED_RUN_GRACE_MS));
  if (!expected) return false;
  const started = Date.parse(lastStartedAt);
  // pg_cron start times can land a few seconds before the scheduled minute boundary.
  return Number.isFinite(started) && started < expected.getTime() - MINUTE_MS;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toKoreaHour(utcHour: number) {
  return (utcHour + KST_OFFSET_HOURS) % 24;
}

function describeStep(field: string, unit: string) {
  const match = field.match(/^\*\/(\d+)$/);
  return match ? `${Number(match[1])}${unit}마다` : null;
}

/** Plain-Korean schedule in Korea time; falls back to the raw expression. */
export function describeCronSchedule(expression: string) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5 || !parseCronExpression(expression)) return expression;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") return expression;

  if (hour === "*") {
    if (minute === "*") return "매분";
    const step = describeStep(minute, "분");
    if (step) return step;
    if (/^\d+$/.test(minute)) return `매시 ${Number(minute)}분`;
    return expression;
  }

  const hourStep = describeStep(hour, "시간");
  if (hourStep && /^\d+$/.test(minute)) return `${hourStep} ${Number(minute)}분`;

  const hours = hour.split(",");
  if (!hours.every((value) => /^\d+$/.test(value))) return expression;
  const koreaHours = hours.map((value) => toKoreaHour(Number(value))).sort((left, right) => left - right);

  if (/^\d+$/.test(minute)) {
    return `매일 ${koreaHours.map((value) => `${pad(value)}:${pad(Number(minute))}`).join(", ")}`;
  }
  const window = minute.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (window && koreaHours.length === 1) {
    const [, from, to, step] = window.map(Number);
    return `매일 ${pad(koreaHours[0])}:${pad(from)}~${pad(koreaHours[0])}:${pad(to)}, ${step}분마다`;
  }
  return expression;
}
