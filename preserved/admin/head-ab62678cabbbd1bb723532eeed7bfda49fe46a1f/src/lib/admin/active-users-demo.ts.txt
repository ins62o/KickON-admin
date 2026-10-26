import type { ActiveUserTrend } from "./active-users";

export type ActiveUserDemoScenario = "growing" | "new";

const DAY_MS = 86_400_000;

function koreaToday(now: Date) {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Deterministic PRNG so the demo chart is identical on every reload. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Simulates members opening the app, then aggregates exactly like
 * admin_get_active_user_trend(): Korea-time DAU and rolling 30-day MAU.
 * Matchdays (Wed/Sat/Sun) pull more members in.
 */
export function buildDemoActiveUserTrend(scenario: ActiveUserDemoScenario, now = new Date()): ActiveUserTrend {
  const today = koreaToday(now);
  const trackedDays = scenario === "new" ? 12 : 240;
  const trackingStartedOn = addDays(today, -(trackedDays - 1));
  const next = random(scenario === "new" ? 7 : 2026);

  const members = Array.from({ length: scenario === "new" ? 260 : 1_200 }, () => {
    // Earlier signups are rarer, so the member base grows over time.
    const joinOffset = Math.floor(Math.sqrt(next()) * trackedDays * 1.1) - Math.floor(trackedDays * 0.1);
    const habit = next();
    return {
      joinedOn: addDays(trackingStartedOn, Math.max(0, joinOffset)),
      openRate: habit < 0.2 ? 0.55 : habit < 0.55 ? 0.18 : 0.05,
      churnAfter: next() < 0.3 ? Math.floor(20 + next() * 60) : Infinity,
    };
  });

  const activeByDate = new Map<string, Set<number>>();
  for (let offset = 0; offset < trackedDays; offset += 1) {
    const date = addDays(trackingStartedOn, offset);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const matchday = weekday === 0 || weekday === 6 || weekday === 3 ? 1.7 : 1;
    const active = new Set<number>();
    members.forEach((member, index) => {
      if (date < member.joinedOn) return;
      const tenure = (Date.parse(date) - Date.parse(member.joinedOn)) / DAY_MS;
      if (tenure > member.churnAfter) return;
      if (next() < Math.min(0.95, member.openRate * matchday)) active.add(index);
    });
    activeByDate.set(date, active);
  }

  const uniqueBetween = (from: string, to: string) => {
    const users = new Set<number>();
    activeByDate.forEach((active, date) => {
      if (date >= from && date <= to) active.forEach((user) => users.add(user));
    });
    return users.size;
  };

  const daily = Array.from({ length: 180 }, (_, index) => {
    const date = addDays(today, index - 179);
    return { date, dau: activeByDate.get(date)?.size ?? 0, mau: uniqueBetween(addDays(date, -29), date) };
  });

  return { generatedAt: now.toISOString(), today, trackingStartedOn, daily };
}
