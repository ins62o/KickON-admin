import assert from "node:assert/strict";
import test from "node:test";

import { getActivityPageNumber, loadCommunityPosts, loadAttendanceRecords } from "../src/lib/admin/activity-records.ts";

test("목록 페이지는 잘못된 URL 값을 첫 페이지로 처리하고 오프셋 범위를 제한한다", () => {
  assert.equal(getActivityPageNumber("3"), 3);
  for (const value of [null, "0", "-1", "1.5", "NaN", "4294967296"]) {
    assert.equal(getActivityPageNumber(value), 1);
  }
});

test("커뮤니티 두 번째 페이지는 전체 내역 RPC의 정확한 범위와 검색어를 조회한다", async () => {
  const result = await loadCommunityPosts({
    async rpc(name, args) {
      assert.equal(name, "admin_get_community_posts");
      assert.deepEqual(args, { p_post_id: null, p_query: "원정", p_offset: 50, p_limit: 50, p_team_id: null });
      return { data: { total: 101, records: [] }, error: null };
    },
  }, 2, " 원정 ");
  assert.equal(result.total, 101);
  assert.deepEqual(result.records, []);
});

test("팀별 검색은 검색어와 페이지 범위를 유지하며 정확한 팀 ID로 조회한다", async () => {
  const result = await loadCommunityPosts({
    async rpc(name, args) {
      assert.equal(name, "admin_get_community_posts");
      assert.deepEqual(args, { p_post_id: null, p_query: "울산", p_offset: 50, p_limit: 50, p_team_id: "incheon" });
      return { data: { total: 52, records: [] }, error: null };
    },
  }, 2, " 울산 ", undefined, "incheon");
  assert.equal(result.total, 52);
});

test("직관 인증은 인증 당시 응원 팀과 검색어로 페이지 범위를 조회한다", async () => {
  const result = await loadAttendanceRecords({
    async rpc(name, args) {
      assert.equal(name, "admin_get_attendance_records");
      assert.deepEqual(args, { p_attendance_id: null, p_query: "문학", p_offset: 50, p_limit: 50, p_team_id: "incheon" });
      return { data: { total: 51, records: [] }, error: null };
    },
  }, 2, " 문학 ", undefined, "incheon");
  assert.equal(result.total, 51);
});

test("인증 상세는 선택한 UUID만 조회해 해당 인증을 반환한다", async () => {
  const id = "126c1b84-cf83-4e94-a62f-7c53313919d1";
  const result = await loadAttendanceRecords({
    async rpc(name, args) {
      assert.equal(name, "admin_get_attendance_records");
      assert.equal(args.p_attendance_id, id);
      assert.equal(args.p_team_id, null);
      return { data: { total: 1, records: [{ id }] }, error: null };
    },
  }, 1, "", id);
  assert.equal(result.total, 1);
  assert.equal(result.records[0]?.id, id);
});

test("잘못된 상세 ID는 전체 목록 조회로 바뀌지 않고 요청 전에 거절한다", async () => {
  const client = { rpc() { assert.fail("잘못된 ID로 DB 요청을 보내면 안 됩니다"); } };
  await assert.rejects(loadCommunityPosts(client, 1, "", ""));
  await assert.rejects(loadAttendanceRecords(client, 1, "", "not-a-uuid"));
});

test("조회 권한 실패와 미적용 RPC는 빈 내역으로 표시하지 않는다", async () => {
  await assert.rejects(loadAttendanceRecords({
    async rpc() { return { data: null, error: { code: "42501", message: "ATTENDANCE_PERMISSION_REQUIRED" } }; },
  }), /권한/);
  await assert.rejects(loadCommunityPosts({
    async rpc() { return { data: null, error: { code: "PGRST202", message: "schema cache" } }; },
  }), /조회 기능/);
});

test("잘못된 집계 응답은 거절하고 실제 0건은 정상으로 표시한다", async () => {
  for (const data of [{ total: -1, records: [] }, { total: 4, records: null }, { total: "5", records: [] }]) {
    await assert.rejects(loadCommunityPosts({ async rpc() { return { data, error: null }; } }), /응답/);
  }
  const data = await loadAttendanceRecords({ async rpc() { return { data: { total: 0, records: [] }, error: null }; } });
  assert.equal(data.total, 0);
});
