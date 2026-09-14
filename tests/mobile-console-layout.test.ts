import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("모바일 헤더는 앱 로고를 숨기고 데스크톱에서는 유지한다", () => {
  const header = fs.readFileSync(path.join(root, "src/components/layout/header.tsx"), "utf8");

  assert.match(header, /className="hidden shrink-0 items-center gap-2\.5[^\"]*xl:flex"/);
});

test("모바일 메뉴는 그룹 제목과 메뉴 항목의 색상 계층을 구분한다", () => {
  const navigation = fs.readFileSync(path.join(root, "src/components/layout/mobile-navigation.tsx"), "utf8");

  assert.match(navigation, /text-\[10px\] font-extrabold tracking-\[0\.16em\] text-muted-foreground\/65/);
  assert.match(navigation, /text-foreground\/80 hover:bg-accent\/65 hover:text-foreground/);
  assert.match(navigation, /active \? "text-primary" : "text-muted-foreground\/80"/);
});

test("모바일 동기화 카드는 아이콘 옆에 두 줄 제목 영역을 확보한다", () => {
  const syncControl = fs.readFileSync(path.join(root, "src/components/sync/sync-control.tsx"), "utf8");

  assert.match(syncControl, /"h-36! w-full/);
  assert.match(syncControl, /compactOnMobile && "h-28![^"]*md:h-36!/);
  assert.match(syncControl, /line-clamp-2 min-w-0 text-sm leading-5 font-semibold text-foreground md:hidden/);
  assert.match(syncControl, /mt-3 hidden max-w-full truncate text-sm font-semibold text-foreground md:block/);
});

test("모바일 대시보드 지표는 값과 구분선 사이 여백을 유지한다", () => {
  const dashboardPage = fs.readFileSync(path.join(root, "src/app/(console)/page.tsx"), "utf8");
  const dashboardLoading = fs.readFileSync(path.join(root, "src/app/(console)/loading.tsx"), "utf8");

  assert.match(dashboardPage, /className="mt-3 min-w-0 pb-2"/);
  assert.match(dashboardPage, /const PROFILE_TARGET = 1_000/);
  assert.match(dashboardPage, /rate=\{profileRate\}/);
  assert.match(dashboardPage, /rateLabel="목표 달성률"/);
  assert.match(dashboardPage, /rateSuffix="달성"/);
  assert.match(dashboardPage, /목표 \$\{formatNumber\(PROFILE_TARGET\)\}명/);
  assert.match(dashboardPage, /<CompactUsageGauge[\s\S]*title="총 가입자"[\s\S]*rate=\{profileRate\}/);
  assert.match(dashboardLoading, /className="mt-2 mb-2 h-6 w-20 max-w-full"/);
  assert.match(dashboardLoading, /mt-2 h-1\.5 w-full rounded-full/);
});

test("모바일 사용자 화면은 팀 요약과 검색 조건을 두 열로 배치한다", () => {
  const usersPage = fs.readFileSync(path.join(root, "src/app/(console)/users/page.tsx"), "utf8");
  const usersLoading = fs.readFileSync(path.join(root, "src/app/(console)/users/loading.tsx"), "utf8");

  assert.match(usersPage, /grid flex-1 grid-cols-2 content-start[^\"]*md:grid-cols-1/);
  assert.match(usersPage, /grid min-h-24 min-w-0 grid-cols-\[32px_minmax\(0,1fr\)_auto\][^\"]*md:grid-cols-\[40px_minmax\(0,1fr\)_auto\]/);
  assert.match(usersPage, /col-span-3 row-start-2[^\"]*md:col-span-1 md:row-start-auto/);
  assert.match(usersPage, /col-start-3 row-start-1[^\"]*md:col-start-auto md:row-start-auto/);
  assert.match(usersPage, /grid grid-cols-2 gap-3 border-b/);
  assert.match(usersPage, /col-span-2 xl:col-span-1/);
  assert.match(usersPage, /title="사용자"[\s\S]*className="flex-row items-center justify-between"[\s\S]*actions=\{\(/);
  assert.equal((usersPage.match(/전체 가입자/g) ?? []).length, 1);
  assert.match(usersLoading, /grid flex-1 grid-cols-2 content-start[^\"]*md:grid-cols-1/);
  assert.match(usersLoading, /grid min-h-24 grid-cols-\[32px_minmax\(0,1fr\)_auto\][^\"]*md:grid-cols-\[40px_minmax\(0,1fr\)_auto\]/);
  assert.match(usersLoading, /grid grid-cols-2 gap-3 border-b/);
  assert.match(usersLoading, /h-11 w-28 rounded-xl sm:w-36/);
});

test("모바일 사용자 상세는 빈 지표 칸 없이 터치형 액션과 정보 행을 사용한다", () => {
  const detailPage = fs.readFileSync(path.join(root, "src/app/(console)/users/detail/page.tsx"), "utf8");
  const detailLoading = fs.readFileSync(path.join(root, "src/app/(console)/users/detail/loading.tsx"), "utf8");
  const moderationForm = fs.readFileSync(path.join(root, "src/components/admin/user-moderation-form.tsx"), "utf8");

  assert.match(detailPage, /grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto/);
  assert.match(detailPage, /compactOnMobile centered itemClassName="min-h-24 md:min-h-32"/);
  assert.match(detailPage, /\[&>div:last-child\]:col-span-2[^"]*sm:\[&>div:last-child\]:col-span-1/);
  assert.match(detailPage, /grid gap-px border-t border-border\/70[^"]*sm:grid-cols-2[^"]*xl:grid-cols-3/);
  assert.match(detailPage, /size-12[^"]*sm:size-10/);
  assert.match(moderationForm, /h-11! w-full min-w-24[^"]*sm:w-auto/);
  assert.doesNotMatch(moderationForm, /sm:h-9!/);
  assert.match(detailLoading, /grid grid-cols-2 gap-2 sm:flex/);
  assert.match(detailLoading, /flex min-h-24 flex-col items-center justify-center/);
  assert.match(detailLoading, /last:col-span-2[^"]*xl:last:col-span-1/);
  assert.doesNotMatch(detailLoading, /FormSkeleton/);
});

test("모바일 문의·신고 화면은 고정 너비 표 대신 터치형 목록을 사용한다", () => {
  const inquiriesPage = fs.readFileSync(path.join(root, "src/app/(console)/inquiries/page.tsx"), "utf8");
  const inquiriesLoading = fs.readFileSync(path.join(root, "src/app/(console)/inquiries/loading.tsx"), "utf8");

  assert.equal((inquiriesPage.match(/divide-y divide-border\/70 md:hidden/g) ?? []).length, 2);
  assert.equal((inquiriesPage.match(/hidden overflow-x-auto md:block/g) ?? []).length, 2);
  assert.equal((inquiriesPage.match(/grid grid-cols-2 gap-3 border-b/g) ?? []).length, 2);
  assert.equal((inquiriesPage.match(/className="grid-cols-2!"/g) ?? []).length, 2);
  assert.match(inquiriesPage, /grid! h-14! w-full/);
  assert.equal((inquiriesPage.match(/compactOnMobile/g) ?? []).length, 2);
  assert.equal((inquiriesPage.match(/itemClassName="min-h-20 flex-col/g) ?? []).length, 2);
  assert.match(inquiriesLoading, /grid h-14 grid-cols-2/);
  assert.match(inquiriesLoading, /size-8 shrink-0 rounded-md md:size-10/);
  assert.equal((inquiriesPage.match(/border border-primary\/15 bg-primary\/\[0\.07\] px-2 py-1/g) ?? []).length, 2);
  assert.match(inquiriesPage, />문의자<\/span>/);
  assert.match(inquiriesPage, />신고자<\/span>/);
  assert.match(inquiriesLoading, /mt-3 border-t border-border\/60 pt-3/);
});

test("모바일 문의 상세는 상태와 요청 정보를 압축하고 답변 액션을 터치 크기로 표시한다", () => {
  const detailPage = fs.readFileSync(path.join(root, "src/app/(console)/inquiries/detail/page.tsx"), "utf8");
  const detailLoading = fs.readFileSync(path.join(root, "src/app/(console)/inquiries/detail/loading.tsx"), "utf8");
  const actionForm = fs.readFileSync(path.join(root, "src/components/admin/inquiry-action-form.tsx"), "utf8");

  assert.match(detailPage, /flex-row items-start justify-between gap-3 sm:items-start/);
  assert.match(detailPage, /grid grid-cols-2 gap-px border-t border-border\/70 bg-border\/70/);
  assert.match(detailPage, /border-b border-border\/70 px-4 py-4 text-base font-semibold sm:border-0 sm:p-0/);
  assert.match(actionForm, /h-11! w-full px-5 font-extrabold sm:w-auto/);
  assert.doesNotMatch(actionForm, /<label[^>]*>사용자 답변/);
  assert.match(actionForm, /aria-label="답변 내용"/);
  assert.match(detailLoading, /grid grid-cols-2 gap-px border-t border-border\/70 bg-border\/70/);
  assert.match(detailLoading, /mt-4 h-11 w-full rounded-lg sm:ml-auto sm:w-24/);
});

test("모바일 선수 상세는 기록과 정보를 압축하고 수정·삭제 버튼 높이를 맞춘다", () => {
  const detailPage = fs.readFileSync(path.join(root, "src/app/(console)/squads/detail/page.tsx"), "utf8");
  const detailLoading = fs.readFileSync(path.join(root, "src/app/(console)/squads/detail/loading.tsx"), "utf8");
  const overrideControl = fs.readFileSync(path.join(root, "src/components/players/player-override-control.tsx"), "utf8");

  assert.match(detailPage, /mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl/);
  assert.match(detailPage, /flex min-w-0 items-start justify-between gap-4[^"]*sm:block/);
  assert.match(detailPage, /player\.teamName\} · \{positionLabel\(player\.position\)/);
  assert.match(overrideControl, /grid w-full grid-cols-2 items-center gap-2 sm:w-72/);
  assert.equal((overrideControl.match(/h-11! w-full px-5 font-extrabold/g) ?? []).length, 2);
  assert.doesNotMatch(overrideControl, /sm:w-auto/);
  assert.doesNotMatch(overrideControl, /sm:h-(?:9|10)!/);
  assert.match(detailLoading, /grid w-full grid-cols-2 gap-2 sm:w-72/);
  assert.equal((detailLoading.match(/h-11 rounded-lg/g) ?? []).length, 2);
  assert.doesNotMatch(detailLoading, /sm:h-(?:9|10)/);
  assert.doesNotMatch(detailLoading, /FormSkeleton/);
});

test("모바일 선수 관리는 터치형 목록을 사용하고 PC 표를 유지한다", () => {
  const squadsPage = fs.readFileSync(path.join(root, "src/app/(console)/squads/page.tsx"), "utf8");
  const playersTable = fs.readFileSync(path.join(root, "src/components/players/players-table.tsx"), "utf8");
  const dataTable = fs.readFileSync(path.join(root, "src/components/data-table/data-table.tsx"), "utf8");
  const squadsLoading = fs.readFileSync(path.join(root, "src/app/(console)/squads/loading.tsx"), "utf8");

  assert.match(squadsPage, /className="flex-row items-center justify-between"/);
  assert.match(squadsPage, /className="mt-6 grid-cols-2!"/);
  assert.match(playersTable, /compactOnMobile/);
  assert.match(playersTable, /renderMobileRow=\{\(player\) => <PlayerMobileRow player=\{player\} \/>\}/);
  assert.match(dataTable, /divide-y divide-border\/70 md:hidden/);
  assert.match(dataTable, /hidden overflow-x-auto md:block/);
  assert.match(squadsLoading, /divide-y divide-border\/70 md:hidden/);
  assert.match(squadsLoading, /hidden overflow-x-auto md:block/);
});

test("선수 등록 리그 선택은 앱 드롭다운 스타일을 사용한다", () => {
  const manualPlayerForm = fs.readFileSync(path.join(root, "src/components/admin/manual-player-form.tsx"), "utf8");

  assert.match(manualPlayerForm, /id="manual-player-league" className="h-11! w-full cursor-pointer rounded-xl border-border\/80 bg-muted\/35/);
  assert.match(manualPlayerForm, /SelectContent position="popper" align="start" className="w-\(--radix-select-trigger-width\) rounded-xl/);
});

test("모바일 일정 관리는 지표와 필터를 빈칸 없이 배치한다", () => {
  const schedulesPage = fs.readFileSync(path.join(root, "src/app/(console)/schedules/page.tsx"), "utf8");
  const scheduleTable = fs.readFileSync(path.join(root, "src/components/fixtures/schedule-table.tsx"), "utf8");
  const schedulesLoading = fs.readFileSync(path.join(root, "src/app/(console)/schedules/loading.tsx"), "utf8");
  const clientPageState = fs.readFileSync(path.join(root, "src/components/admin/client-page-state.tsx"), "utf8");

  assert.match(schedulesPage, /className="mt-6 grid-cols-3!"/);
  assert.match(schedulesPage, /compactOnMobile/);
  assert.match(schedulesPage, /compactOnMobile\s+centered/);
  assert.match(schedulesPage, /grid-cols-3!/);
  assert.match(scheduleTable, /grid grid-cols-2 gap-3 border-b/);
  assert.match(scheduleTable, /rounded-md bg-primary\/10 text-primary[^>]*><SlidersHorizontal className="size-3"/);
  assert.match(scheduleTable, /<SearchInput[\s\S]*containerClassName="col-span-2 xl:col-span-1"/);
  assert.doesNotMatch(scheduleTable, /총 <strong[^>]*>\{filtered\.length/);
  assert.match(scheduleTable, /min-h-0[^"]*md:min-h-96/);
  assert.match(schedulesLoading, /grid grid-cols-3 gap-px/);
  assert.match(schedulesLoading, /p-2\.5 text-center md:p-4/);
  assert.doesNotMatch(schedulesLoading, /md:mx-0/);
  assert.match(schedulesLoading, /mt-5 grid grid-cols-2 gap-2/);
  assert.match(clientPageState, /pathname\.startsWith\("\/schedules"\)\) skeleton = <SchedulesLoading/);
  assert.match(schedulesLoading, /col-span-2 h-12 rounded-xl xl:col-span-1/);
  assert.equal((schedulesLoading.match(/h-11 rounded-xl/g) ?? []).length >= 2, true);
  assert.doesNotMatch(schedulesLoading, /mt-3 h-5 w-full max-w-xl/);
});

test("관리 화면의 본문 검색창은 하나의 검색 입력 디자인을 사용한다", () => {
  const searchInput = fs.readFileSync(path.join(root, "src/components/ui/search-input.tsx"), "utf8");
  const dataTable = fs.readFileSync(path.join(root, "src/components/data-table/data-table.tsx"), "utf8");
  const scheduleTable = fs.readFileSync(path.join(root, "src/components/fixtures/schedule-table.tsx"), "utf8");
  const usersPage = fs.readFileSync(path.join(root, "src/app/(console)/users/page.tsx"), "utf8");
  const inquiriesPage = fs.readFileSync(path.join(root, "src/app/(console)/inquiries/page.tsx"), "utf8");

  assert.match(searchInput, /top-1\/2 left-4 size-4 -translate-y-1\/2/);
  assert.match(searchInput, /h-12 rounded-xl border-border\/80 bg-background\/75 pr-4 pl-11 text-sm shadow-sm/);
  assert.match(dataTable, /<SearchInput/);
  assert.match(scheduleTable, /<SearchInput/);
  assert.match(usersPage, /<SearchInput/);
  assert.equal((inquiriesPage.match(/<SearchInput/g) ?? []).length, 2);
});

test("모바일 팀 관리는 순위 카드 목록을 사용하고 PC 표를 유지한다", () => {
  const standingsPage = fs.readFileSync(path.join(root, "src/app/(console)/standings/page.tsx"), "utf8");
  const standingsLoading = fs.readFileSync(path.join(root, "src/app/(console)/standings/loading.tsx"), "utf8");

  assert.match(standingsPage, /grid-cols-\[28px_40px_minmax\(0,1fr\)_auto\][^\"]*md:hidden/);
  assert.doesNotMatch(standingsPage, /row\.played\}경기 · \{row\.won\}승/);
  assert.match(standingsPage, /relative size-10">[\s\S]*sizes="40px" className="object-contain"/);
  assert.equal((standingsPage.match(/<span className="relative size-10">/g) ?? []).length, 2);
  assert.doesNotMatch(standingsPage, /rounded-lg bg-white p-1/);
  assert.match(standingsPage, /divide-y divide-border\/70 md:hidden/);
  assert.match(standingsPage, /hidden overflow-x-auto md:block/);
  assert.doesNotMatch(standingsPage, /hidden sm:block"><LeagueFilter allowAll=\{false\}/);
  assert.match(standingsPage, /min-w-0 text-base font-semibold/);
  assert.match(standingsPage, /shrink-0"><LeagueFilter allowAll=\{false\} className="my-0"/);
  assert.match(standingsLoading, /StandingMobileRowSkeleton/);
  assert.doesNotMatch(standingsLoading, /my-5 hidden sm:flex/);
  assert.match(standingsLoading, /h-11 w-40 rounded-xl/);
  assert.match(standingsLoading, /hidden overflow-x-auto md:block/);
});

test("모바일 팀 상세는 투명 엠블럼과 압축 지표 및 선수 카드 목록을 사용한다", () => {
  const detailPage = fs.readFileSync(path.join(root, "src/app/(console)/standings/detail/page.tsx"), "utf8");
  const detailLoading = fs.readFileSync(path.join(root, "src/app/(console)/standings/detail/loading.tsx"), "utf8");
  const teamPlayers = fs.readFileSync(path.join(root, "src/components/players/team-players-table.tsx"), "utf8");

  assert.match(detailPage, /sizes="\(max-width: 639px\) 56px, 64px" className="object-contain"/);
  assert.doesNotMatch(detailPage, /bg-white p-2/);
  assert.match(detailPage, /triggerClassName="h-11 w-full px-5 font-bold"/);
  assert.match(detailPage, /mt-5 grid grid-cols-2 gap-px overflow-hidden/);
  assert.match(detailPage, /className="col-span-2 sm:col-span-1"/);
  assert.match(detailPage, /mt-4 pb-1 text-xl font-bold/);
  assert.match(teamPlayers, /divide-y divide-border\/70 md:hidden/);
  assert.match(teamPlayers, /hidden overflow-x-auto md:block/);
  assert.match(teamPlayers, /h-11! min-w-0 flex-1/);
  assert.match(detailLoading, /mt-5 grid grid-cols-2 gap-px overflow-hidden/);
  assert.match(detailLoading, /divide-y divide-border\/70 md:hidden/);
});

test("모바일 데이터 관리는 동기화·사용량·로그를 카드형으로 표시한다", () => {
  const dataPage = fs.readFileSync(path.join(root, "src/app/(console)/data-management/page.tsx"), "utf8");
  const dataLoading = fs.readFileSync(path.join(root, "src/app/(console)/data-management/loading.tsx"), "utf8");
  const usageGauge = fs.readFileSync(path.join(root, "src/components/dashboard/compact-usage-gauge.tsx"), "utf8");
  const auditTable = fs.readFileSync(path.join(root, "src/components/admin/audit-log-table.tsx"), "utf8");

  assert.match(dataPage, /lastSync=\{syncHistory\}[\s\S]*compactOnMobile/);
  assert.match(dataPage, /grid grid-cols-2 gap-px md:grid-cols-2 xl:grid-cols-3/);
  assert.match(dataPage, /className="col-span-2 md:col-span-1"/);
  assert.match(dataPage, /<AuditLogTable[^>]*compactOnMobile/);
  assert.match(usageGauge, /min-h-44 p-3\.5 md:min-h-72/);
  assert.match(auditTable, /divide-y divide-border\/70 md:hidden/);
  assert.match(auditTable, /hidden md:block/);
  assert.match(dataLoading, /grid grid-cols-2 gap-2 md:min-w-\[1260px\] md:grid-cols-7/);
  assert.match(dataLoading, /divide-y divide-border\/70 md:hidden/);
});
