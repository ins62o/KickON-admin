import assert from "node:assert/strict";
import test from "node:test";

import {
  cronMissedLatestRun,
  describeCronSchedule,
  nextCronOccurrence,
  parseCronExpression,
  previousCronOccurrence,
} from "../src/lib/cron/schedule.ts";

const at = (iso: string) => new Date(iso);

test("프로젝트에 등록된 cron 식을 모두 해석한다", () => {
  for (const expression of ["* * * * *", "*/5 * * * *", "17 3 * * *", "43 3 * * *", "40 19 * * *", "10 19 * * *", "15-40/5 19 * * *", "10 1,7,13,19 * * *"]) {
    assert.ok(parseCronExpression(expression), expression);
  }
  assert.equal(parseCronExpression("61 * * * *"), null);
  assert.equal(parseCronExpression("@daily"), null);
});

test("다음·이전 실행 시각을 UTC 기준으로 계산한다", () => {
  const now = at("2026-09-26T19:22:30Z");
  assert.equal(nextCronOccurrence("* * * * *", now)?.toISOString(), "2026-09-26T19:23:00.000Z");
  assert.equal(nextCronOccurrence("*/5 * * * *", now)?.toISOString(), "2026-09-26T19:25:00.000Z");
  assert.equal(nextCronOccurrence("15-40/5 19 * * *", now)?.toISOString(), "2026-09-26T19:25:00.000Z");
  assert.equal(nextCronOccurrence("15-40/5 19 * * *", at("2026-09-26T19:41:00Z"))?.toISOString(), "2026-09-27T19:15:00.000Z");
  assert.equal(nextCronOccurrence("10 1,7,13,19 * * *", now)?.toISOString(), "2026-09-27T01:10:00.000Z");
  assert.equal(previousCronOccurrence("17 3 * * *", now)?.toISOString(), "2026-09-26T03:17:00.000Z");
  assert.equal(previousCronOccurrence("15-40/5 19 * * *", now)?.toISOString(), "2026-09-26T19:20:00.000Z");
});

test("예정된 최근 실행을 놓쳤을 때만 지연으로 본다", () => {
  const now = at("2026-09-26T12:00:00Z");
  assert.equal(cronMissedLatestRun("* * * * *", "2026-09-26T11:54:59Z", now), false);
  assert.equal(cronMissedLatestRun("* * * * *", "2026-09-26T11:40:00Z", now), true);
  assert.equal(cronMissedLatestRun("17 3 * * *", "2026-09-26T03:17:01Z", now), false);
  assert.equal(cronMissedLatestRun("17 3 * * *", "2026-09-25T03:17:01Z", now), true);
  // 하루에 여러 번 도는 재시도 작업은 창이 끝난 뒤 다음 날까지 지연이 아니다.
  assert.equal(cronMissedLatestRun("15-40/5 19 * * *", "2026-09-25T19:40:02Z", now), false);
  assert.equal(cronMissedLatestRun("17 3 * * *", null, now), false);
});

test("스케줄을 한국 시간 기준의 쉬운 말로 보여준다", () => {
  assert.equal(describeCronSchedule("* * * * *"), "매분");
  assert.equal(describeCronSchedule("*/5 * * * *"), "5분마다");
  assert.equal(describeCronSchedule("17 3 * * *"), "매일 12:17");
  assert.equal(describeCronSchedule("40 19 * * *"), "매일 04:40");
  assert.equal(describeCronSchedule("15-40/5 19 * * *"), "매일 04:15~04:40, 5분마다");
  assert.equal(describeCronSchedule("10 1,7,13,19 * * *"), "매일 04:10, 10:10, 16:10, 22:10");
  assert.equal(describeCronSchedule("0 0 * * 1"), "0 0 * * 1");
});
