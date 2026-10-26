import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  axisLabelIndexes,
  niceAxis,
  parseActiveUserTrend,
  summarizeActiveUsers,
  visibleActiveUserDays,
  type ActiveUserDay,
} from "../src/lib/admin/active-users.ts";
import { buildDemoActiveUserTrend } from "../src/lib/admin/active-users-demo.ts";

function days(endDate: string, count: number, value: (index: number) => Omit<ActiveUserDay, "date">) {
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - 1 - index));
    return { date: date.toISOString().slice(0, 10), ...value(index) };
  });
}

function trend(trackingStartedOn: string | null, daily: ActiveUserDay[]) {
  return {
    generatedAt: "2026-09-26T03:00:00Z",
    today: "2026-09-26",
    trackingStartedOn,
    daily,
  };
}

test("활성 사용자 응답은 형식이 맞을 때만 받아들인다", () => {
  const valid = trend("2026-08-10", days("2026-09-26", 90, () => ({ dau: 1, mau: 3 })));
  assert.deepEqual(parseActiveUserTrend(valid), valid);
  assert.equal(parseActiveUserTrend(null), null);
  assert.equal(parseActiveUserTrend({ ...valid, daily: [{ date: "2026-09-26", dau: -1, mau: 0 }] }), null);
  assert.equal(parseActiveUserTrend({ ...valid, trackingStartedOn: "9월" }), null);
});

test("집계 시작 전 구간은 0으로 그리지 않고 잘라낸다", () => {
  const data = trend("2026-09-20", days("2026-09-26", 90, () => ({ dau: 1, mau: 1 })));
  assert.deepEqual(visibleActiveUserDays(data, "1m").map((day) => day.date).slice(0, 2), ["2026-09-20", "2026-09-21"]);
  assert.equal(visibleActiveUserDays(data, "3m").length, 7);
  assert.deepEqual(visibleActiveUserDays(trend(null, data.daily), "1m"), []);
});

test("요약은 오늘 지표와 30일 평균 기준 고착도를 계산한다", () => {
  const data = trend("2026-07-01", days("2026-09-26", 90, (index) => ({ dau: index % 2 === 0 ? 10 : 30, mau: 50 + index })));
  const summary = summarizeActiveUsers(data);
  assert.equal(summary.mau, 139);
  assert.equal(summary.dau, 30);
  assert.equal(summary.dauDelta, 20);
  assert.equal(summary.mauDelta, 1);
  // 고착도는 오늘 하루가 아니라 최근 30일 평균 DAU(20명)를 MAU로 나눈다.
  assert.ok(Math.abs((summary.stickiness ?? 0) - (20 / 139) * 100) < 1e-9);
});

test("이용자가 없으면 고착도와 그 변화는 비워 둔다", () => {
  const data = trend("2026-09-10", days("2026-09-26", 90, () => ({ dau: 0, mau: 0 })));
  const summary = summarizeActiveUsers(data);
  assert.equal(summary.stickiness, null);
  assert.equal(summary.stickinessDelta, null);
  assert.equal(summary.dauDelta, 0);
});

test("고착도 평균은 집계 시작 전 0명 날짜를 포함하지 않는다", () => {
  const data = trend("2026-09-24", days("2026-09-26", 90, (index) => ({ dau: index >= 87 ? 6 : 0, mau: 10 })));
  const summary = summarizeActiveUsers(data);
  assert.equal(summary.stickiness, 60);
});

test("축 최댓값은 보기 좋은 단위로 올림한다", () => {
  assert.deepEqual(niceAxis(0), { max: 4, ticks: [0, 1, 2, 3, 4] });
  assert.deepEqual(niceAxis(3), { max: 3, ticks: [0, 1, 2, 3] });
  assert.deepEqual(niceAxis(236), { max: 300, ticks: [0, 100, 200, 300] });
  assert.equal(niceAxis(137).max, 150);
  assert.equal(niceAxis(1_234).max, 1_500);
});

test("날짜 라벨은 최신 날짜를 항상 포함한다", () => {
  assert.deepEqual(axisLabelIndexes(3), [0, 1, 2]);
  const indexes = axisLabelIndexes(90);
  assert.equal(indexes.at(-1), 89);
  assert.ok(indexes.length <= 6);
});

test("활성 사용자 원장은 가입 완료 회원의 한국 날짜 하루 1건만 남긴다", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/202609260006_app_daily_activity.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /primary key \(activity_date, user_id\)/);
  assert.match(migration, /\(now\(\) at time zone 'Asia\/Seoul'\)::date/);
  assert.match(migration, /profile\.registration_completed_at is not null/);
  assert.match(migration, /on conflict \(activity_date, user_id\) do nothing/);
  assert.match(migration, /admin_has_capability\('dashboard\.read'\)/);
  assert.match(migration, /revoke all on public\.app_daily_activity from public, anon, authenticated/);
  assert.doesNotMatch(migration, /wau/i);
});

test("가짜 데이터는 실제 응답 형식을 지키고 DAU가 MAU를 넘지 않는다", () => {
  const now = new Date("2026-09-26T03:00:00Z");
  for (const scenario of ["growing", "new"] as const) {
    const data = buildDemoActiveUserTrend(scenario, now);
    assert.deepEqual(parseActiveUserTrend(data), data);
    assert.equal(data.daily.at(-1)?.date, "2026-09-26");
    assert.ok(data.daily.every((day) => day.dau <= day.mau));
    assert.deepEqual(buildDemoActiveUserTrend(scenario, now), data);
  }
});

test("기간 탭은 1개월 30일, 3개월 90일, 6개월 180일을 보여준다", () => {
  const data = trend("2026-01-01", days("2026-09-26", 180, () => ({ dau: 1, mau: 2 })));
  assert.equal(visibleActiveUserDays(data, "1m").length, 30);
  assert.equal(visibleActiveUserDays(data, "3m").length, 90);
  assert.equal(visibleActiveUserDays(data, "6m").length, 180);
});

test("어제 대비 변화는 늘면 양수, 줄면 음수로 계산한다", () => {
  const daily = days("2026-09-26", 60, (index) => ({ dau: index === 59 ? 12 : 20, mau: index === 59 ? 95 : 100 }));
  const summary = summarizeActiveUsers(trend("2026-07-01", daily));
  assert.equal(summary.dauDelta, -8);
  assert.equal(summary.mauDelta, -5);
  assert.ok((summary.stickinessDelta ?? 0) !== 0);

  const firstDay = summarizeActiveUsers(trend("2026-09-26", daily));
  assert.equal(firstDay.dauDelta, null);
  assert.equal(firstDay.mauDelta, null);
  assert.equal(firstDay.stickinessDelta, null);
});
