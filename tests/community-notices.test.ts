import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildCommunityNoticeRpcArgs, communityNoticeErrorMessage } from "../src/lib/admin/community-notice-contract.ts";
import { formatKoreaDateTime, formatKoreaFullDateTime, formatKoreaReadableDateTime } from "../src/lib/format.ts";

const root = process.cwd();

test("전체 공지는 팀 선택 없이, 팀 공지는 선택한 팀으로 RPC 인자를 만든다", () => {
  assert.deepEqual(buildCommunityNoticeRpcArgs({ board: "LEAGUE", teamId: "", title: "  전체 공지  ", content: "  전체 사용자 안내입니다.  " }), {
    ok: true,
    args: { target_board: "LEAGUE", target_team_id: "", notice_title: "전체 공지", notice_content: "전체 사용자 안내입니다." },
  });
  assert.deepEqual(buildCommunityNoticeRpcArgs({ board: "TEAM", teamId: "incheon", title: "팀 공지", content: "인천 팬 안내입니다." }), {
    ok: true,
    args: { target_board: "TEAM", target_team_id: "incheon", notice_title: "팀 공지", notice_content: "인천 팬 안내입니다." },
  });
});

test("팀 미선택과 제목·내용 길이를 차단한다", () => {
  const base = { board: "TEAM" as const, teamId: "incheon", title: "공지", content: "충분한 공지 내용" };
  assert.equal(buildCommunityNoticeRpcArgs({ ...base, teamId: " " }).ok, false);
  assert.equal(buildCommunityNoticeRpcArgs({ ...base, title: "한" }).ok, false);
  assert.equal(buildCommunityNoticeRpcArgs({ ...base, title: "가".repeat(101) }).ok, false);
  assert.equal(buildCommunityNoticeRpcArgs({ ...base, content: "네글자" }).ok, false);
  assert.equal(buildCommunityNoticeRpcArgs({ ...base, content: "가".repeat(10_001) }).ok, false);
});

test("권한 및 RPC 오류를 운영자가 이해할 메시지로 바꾼다", () => {
  assert.equal(communityNoticeErrorMessage({ message: "ADMIN_PERMISSION_REQUIRED" }), "공지사항을 관리할 권한이 없습니다.");
  assert.equal(communityNoticeErrorMessage({ message: "INVALID_NOTICE_BOARD" }), "공지 노출 범위가 올바르지 않습니다.");
  assert.equal(communityNoticeErrorMessage({ message: "VALID_NOTICE_TEAM_REQUIRED" }), "유효한 대상 팀을 선택해 주세요.");
});

test("목록 쿼리는 NOTICE만 최신순 조회하고 생성·삭제 RPC를 분리한다", () => {
  const loader = fs.readFileSync(path.join(root, "src/lib/admin/community-notices.ts"), "utf8");
  const actions = fs.readFileSync(path.join(root, "src/lib/admin/actions.ts"), "utf8");
  assert.match(loader, /\.eq\("category", "NOTICE"\)/);
  assert.match(loader, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(actions, /"admin_create_community_notice"/);
  assert.match(actions, /"admin_delete_community_notice"/);
});

test("공지 생성·삭제 RPC는 관리자 권한과 감사 로그를 강제한다", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/202609080005_admin_community_notices.sql"),
    "utf8",
  );
  assert.match(migration, /admin_create_community_notice/);
  assert.match(migration, /admin_delete_community_notice/);
  assert.match(migration, /admin_has_capability\('moderation\.write'\)/);
  assert.match(migration, /post\.category = 'NOTICE'/);
  assert.match(migration, /COMMUNITY_NOTICE_CREATED/);
  assert.match(migration, /COMMUNITY_NOTICE_DELETED/);
  assert.match(migration, /grant execute on function public\.admin_create_community_notice/);
  assert.match(migration, /grant execute on function public\.admin_delete_community_notice/);
});

test("전체 공지는 대상 팀 입력 없이 저장용 팀을 내부에서 결정한다", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/202609080006_fix_league_notice_team_fallback.sql"),
    "utf8",
  );
  assert.match(migration, /if normalized_board = 'TEAM' then/);
  assert.match(migration, /resolved_team_id := normalized_team_id/);
  assert.match(migration, /from public\.teams team/);
  assert.match(migration, /case when team\.id = actor_team_id then 0 else 1 end/);
  assert.match(migration, /case when normalized_board = 'TEAM' then resolved_team_id else null end/);
});

test("공지 화면은 중복 제출을 막고 성공 후 관리자 목록을 갱신한다", () => {
  const component = fs.readFileSync(path.join(root, "src/components/admin/community-notice-manager.tsx"), "utf8");
  const actions = fs.readFileSync(path.join(root, "src/lib/admin/actions.ts"), "utf8");
  assert.match(component, /useActionState\(createCommunityNoticeAction/);
  assert.match(component, /disabled=\{pending\}/);
  assert.match(component, /board === "TEAM" \? \(/);
  assert.match(component, /\[\["LEAGUE", "전체 공지"\], \["TEAM", "팀별 공지"\]\]/);
  assert.doesNotMatch(component, /min-h-\[72px\]/);
  assert.match(component, /board === "LEAGUE" \? "min-h-\[308px\] resize-y" : "min-h-\[216px\] resize-y"/);
  assert.match(component, /className="block text-sm font-semibold">기준 팀 \(K리그 1\)/);
  assert.match(component, /기준 팀 \(K리그 1\)/);
  assert.match(component, /K_LEAGUE_1_TEAM_IDS\.has\(team\.id\)/);
  assert.match(component, /getTeamLogoPath/);
  assert.match(component, />공지 작성</);
  assert.doesNotMatch(component, /새 공지 작성/);
  assert.doesNotMatch(component, /<Plus/);
  assert.match(component, /title="공지사항"/);
  assert.doesNotMatch(component, /앱 커뮤니티에 노출할 전체 및 팀별 공지/);
  assert.match(component, /등록된 공지<\/h2>/);
  assert.match(component, /filteredNotices\.length/);
  assert.match(component, /TabsTrigger value="LEAGUE" className="font-bold text-white data-active:text-white">전체 공지/);
  assert.match(component, /TabsTrigger value="TEAM" className="font-bold text-white data-active:text-white">팀별 공지/);
  assert.match(component, /grid h-14! w-full grid-cols-2/);
  assert.match(component, /notice\.board === noticeScope/);
  assert.match(component, /notice\.teamId === activeTeamFilter/);
  assert.match(component, /id="notice-team-filter"/);
  assert.match(component, /selectedFilterTeamLogo/);
  assert.match(component, /getTeamLogoPath\(notice\.teamId\)/);
  assert.match(component, /notice\.board === "TEAM" \? `\$\{notice\.teamName\} · ` : ""/);
  assert.doesNotMatch(component, /formatNoticeDateTime\(notice\.createdAt\)} · \{notice\.authorName\}/);
  assert.match(component, /id="notice-team-filter" className="h-11!/);
  assert.match(component, /if \(nextBoard === "LEAGUE"\) setTeamId\(""\)/);
  assert.match(component, /onChangeCapture=\{\(\) => \{/);
  assert.match(component, /SelectItem value="__all" className="min-h-11/);
  assert.match(component, /SelectItem key=\{team\.id\} value=\{team\.id\} className="min-h-11/);
  assert.match(component, /w-72 px-8 text-center">대상 팀/);
  assert.match(component, /w-64 px-8">등록 시각/);
  assert.match(component, /items-center justify-center gap-2/);
  assert.match(component, /formatNoticeDateTime/);
  assert.match(component, /월 \$\{Number\(part\("day"\)\)\}일/);
  assert.match(component, /\$\{displayHour\}:\$\{part\("minute"\)\}분/);
  assert.doesNotMatch(component, /노출 중 \{visibleCount\}건/);
  assert.match(component, /등록된 \$\{noticeScope === "LEAGUE" \? "전체" : "팀별"\} 공지가 없습니다/);
  assert.match(component, /deleteCommunityNoticeAction/);
  assert.match(component, /pendingLabel="삭제 중…"/);
  assert.match(component, /3_000/);
  assert.match(component, /hourCycle: "h23"/);
  assert.match(component, /hour < 12 \? "오전" : "오후"/);
  assert.match(component, /aria-label=\{`\$\{notice\.title\} 상세 보기`\}/);
  assert.match(component, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.doesNotMatch(component, />작성 관리자<\/TableHead>/);
  assert.doesNotMatch(component, />확인<\/TableHead>/);
  assert.match(component, /colSpan=\{noticeScope === "TEAM" \? 3 : 2\}/);
  assert.match(actions, /invalidateAdminData\(\)/);
});

test("사용자·문의 검색 버튼과 접수 날짜, 드롭다운 너비와 정지 기간을 요청한 형식으로 표시한다", () => {
  const users = fs.readFileSync(path.join(root, "src/app/(console)/users/page.tsx"), "utf8");
  const inquiries = fs.readFileSync(path.join(root, "src/app/(console)/inquiries/page.tsx"), "utf8");
  const moderationForm = fs.readFileSync(path.join(root, "src/components/admin/user-moderation-form.tsx"), "utf8");
  const adminActions = fs.readFileSync(path.join(root, "src/lib/admin/actions.ts"), "utf8");
  assert.doesNotMatch(users, /<Search className=/);
  assert.doesNotMatch(inquiries, /<Search className=/);
  assert.doesNotMatch(users, /\bSearch\b/);
  assert.doesNotMatch(inquiries, /\bSearch\b/);
  assert.equal(formatKoreaReadableDateTime("2026-09-06T13:13:00.000Z"), "9월 6일 오후 10시 13분");
  assert.match(inquiries, /formatKoreaReadableDateTime\(inquiry\.createdAt\)/);
  assert.match(inquiries, /formatKoreaReadableDateTime\(report\.createdAt\)/);
  assert.equal((users.match(/w-\(--radix-select-trigger-width\)/g) ?? []).length, 2);
  assert.equal((inquiries.match(/w-\(--radix-select-trigger-width\)/g) ?? []).length, 4);
  assert.match(moderationForm, /value=\{selectedAction\}/);
  assert.match(moderationForm, /\[1, 3, 7, 30, 90, 365\]/);
  assert.match(moderationForm, /name="suspensionDays"/);
  assert.match(moderationForm, /disabled=\{!suspensionEnabled\}/);
  assert.match(adminActions, /allowedSuspensionDays = new Set\(\[1, 3, 7, 30, 90, 365\]\)/);
  assert.match(adminActions, /suspensionDays \* 86_400_000/);
  assert.match(moderationForm, /onReset=\{\(event\) => event\.preventDefault\(\)\}/);
});

test("관리자 화면 날짜는 12시간제 한국어 형식을 일관되게 사용한다", () => {
  const value = "2026-09-08T06:29:00.000Z";
  assert.equal(formatKoreaDateTime(value), "9월 8일 오후 3시 29분");
  assert.equal(formatKoreaFullDateTime(value), "2026년 9월 8일 오후 3시 29분");

  const playerDetail = fs.readFileSync(path.join(root, "src/app/(console)/squads/detail/page.tsx"), "utf8");
  assert.match(playerDetail, /formatKoreaFullDateTime\(player\.updatedAt\)/);
  assert.doesNotMatch(playerDetail, /hourCycle: "h23"/);
});

test("신고 처리 화면은 문의 용어를 섞지 않고 오류 뒤 입력을 유지한다", () => {
  const labels = fs.readFileSync(path.join(root, "src/lib/admin/labels.ts"), "utf8");
  const form = fs.readFileSync(path.join(root, "src/components/admin/moderation-action-form.tsx"), "utf8");
  const detail = fs.readFileSync(path.join(root, "src/app/(console)/moderation/detail/page.tsx"), "utf8");
  assert.match(labels, /OPEN: "신규 신고"/);
  assert.match(labels, /REVIEWED: "확인 중"/);
  assert.match(labels, /RESOLVED: "처리 완료"/);
  assert.match(labels, /DISMISSED: "기각"/);
  assert.doesNotMatch(form, /새 문의|답변 완료/);
  assert.match(form, /onReset=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(detail, /처리 완료에는 처리 메모가 필요합니다/);
});

test("팀 상세는 활성 수동 수정값을 조회해 보호 해제 기능에 연결한다", () => {
  const detail = fs.readFileSync(path.join(root, "src/app/(console)/standings/detail/page.tsx"), "utf8");
  assert.match(detail, /getEntityProviderOperations\("standing", teamId\)/);
  assert.match(detail, /overrides=\{operations\.overrides\}/);
  assert.doesNotMatch(detail, /showActiveOverrides=\{false\}/);
  assert.match(detail, /showEmptyOverrides=\{false\}/);
});

test("사용자용 WebView와 일반 게시글 작성 UI를 제거하고 신고 화면은 보존한다", () => {
  assert.equal(fs.existsSync(path.join(root, "src/app/(community)/community/page.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/components/community/community-home.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/app/(console)/inquiries/page.tsx")), true);
  assert.equal(fs.existsSync(path.join(root, "src/app/(console)/moderation/detail/page.tsx")), true);
  const navigation = fs.readFileSync(path.join(root, "src/lib/navigation.ts"), "utf8");
  assert.match(navigation, /label: "공지사항"/);
  assert.match(navigation, /label: "문의 신고"/);
});
