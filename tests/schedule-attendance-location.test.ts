import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationName = "202609070002_fixture_attendance_location.sql";
const migration = readFileSync(new URL(migrationName, migrationsDirectory), "utf8");
const scheduleMigrationName = "202609070003_fixture_schedule_edit.sql";
const scheduleMigration = readFileSync(new URL(scheduleMigrationName, migrationsDirectory), "utf8");
const fixedScheduleMigrationName = "202609080007_fix_fixture_schedule_changed_overrides.sql";
const fixedScheduleMigration = readFileSync(new URL(fixedScheduleMigrationName, migrationsDirectory), "utf8");
const stadiumLocalizationName = "202609070004_localize_remaining_stadiums.sql";
const stadiumLocalization = readFileSync(new URL(stadiumLocalizationName, migrationsDirectory), "utf8");
const scheduleStadiumLocalizationName = "202609120008_localize_schedule_stadiums.sql";
const scheduleStadiumLocalization = readFileSync(new URL(scheduleStadiumLocalizationName, migrationsDirectory), "utf8");
const operations = readFileSync(new URL("../src/lib/data/operations.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/lib/operations/actions.ts", import.meta.url), "utf8");
const scheduleCards = readFileSync(new URL("../src/components/fixtures/schedule-table.tsx", import.meta.url), "utf8");
const scheduleDateTimePicker = readFileSync(new URL("../src/components/fixtures/schedule-date-time-picker.tsx", import.meta.url), "utf8");
const entityOverrideControl = readFileSync(new URL("../src/components/operations/entity-override-control.tsx", import.meta.url), "utf8");
const longReasonMigrationName = "202609120007_allow_long_fixture_override_reasons.sql";
const longReasonMigration = readFileSync(new URL(longReasonMigrationName, migrationsDirectory), "utf8");
const navigation = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");

test("일정 위치 마이그레이션은 경기별 좌표와 인증 반경을 저장한다", () => {
  const migrationNames = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrationNames.indexOf(migrationName) > migrationNames.indexOf("202609070001_admin_delete_player.sql"));
  assert.match(migration, /add column if not exists attendance_latitude double precision/);
  assert.match(migration, /add column if not exists attendance_longitude double precision/);
  assert.match(migration, /add column if not exists attendance_radius_meters integer not null default 300/);
  assert.match(migration, /admin_has_capability\('football\.write'\)/);
  assert.match(migration, /'stadium_id'[\s\S]*'attendance_latitude'[\s\S]*'attendance_longitude'[\s\S]*'attendance_radius_meters'/);
  assert.match(migration, /'FIXTURE_ATTENDANCE_LOCATION_UPDATED'/);
});

test("직관 인증은 경기별 위치를 우선하고 경기장 좌표를 fallback으로 사용한다", () => {
  assert.match(migration, /verification_latitude := coalesce\(target_fixture\.attendance_latitude, target_stadium\.latitude\)/);
  assert.match(migration, /verification_longitude := coalesce\(target_fixture\.attendance_longitude, target_stadium\.longitude\)/);
  assert.match(migration, /if calculated_distance > verification_radius then/);
  assert.match(migration, /grant execute on function public\.create_gps_attendance\([\s\S]*to authenticated/);
});

test("일정 관리 화면은 새 인증 위치 필드를 조회하고 메뉴에서 접근할 수 있다", () => {
  assert.match(operations, /stadium_id,attendance_latitude,attendance_longitude,attendance_radius_meters,kickoff_at/);
  assert.match(operations, /name_ko,address,address_ko/);
  assert.match(operations, /name: row\.name_ko \?\? row\.name/);
  assert.match(navigation, /label: "일정 관리", href: "\/schedules"/);
});

test("일정 수정은 경기 일시와 인증 위치를 한 번에 잠그고 기록한다", () => {
  const migrationNames = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrationNames.indexOf(scheduleMigrationName) > migrationNames.indexOf(migrationName));
  assert.match(scheduleMigration, /admin_update_fixture_schedule\(/);
  assert.match(scheduleMigration, /\('kickoff_at',[\s\S]*\('stadium_id',[\s\S]*\('attendance_latitude'/);
  assert.match(scheduleMigration, /set kickoff_at = p_kickoff_at/);
  assert.match(scheduleMigration, /'FIXTURE_SCHEDULE_UPDATED'/);
  assert.match(scheduleMigration, /grant execute on function public\.admin_update_fixture_schedule\([\s\S]*to authenticated/);
  assert.match(actions, /rpc\("admin_update_fixture_schedule"/);
});

test("일정 수정은 실제로 바뀐 필드만 보호하고 원본 복귀 시 잠금을 해제한다", () => {
  const migrationNames = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrationNames.indexOf(fixedScheduleMigrationName) > migrationNames.indexOf(scheduleMigrationName));
  assert.match(fixedScheduleMigration, /change\.original_value is distinct from change\.override_value/);
  assert.match(fixedScheduleMigration, /active_override\.original_value is not distinct from target\.target_value/);
  assert.match(fixedScheduleMigration, /target_latitude := null/);
  assert.match(fixedScheduleMigration, /FIXTURE_SCHEDULE_UNCHANGED/);
  assert.match(actions, /변경된 일정 정보가 없습니다/);
});

test("남은 경기장 이름과 주소를 한국어로 고정한다", () => {
  const migrationNames = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrationNames.indexOf(stadiumLocalizationName) > migrationNames.indexOf(scheduleMigrationName));
  assert.match(stadiumLocalization, /sportmonks-venue-320604', 'DGB대구은행파크', '대구광역시 북구 고성로 191'/);
  assert.match(stadiumLocalization, /sportmonks-venue-14076', '수원종합운동장', '경기도 수원시 장안구 경수대로 893'/);
  assert.match(stadiumLocalization, /name_ko = localized\.name_ko/);
  assert.match(stadiumLocalization, /address_ko = localized\.address_ko/);
  assert.match(scheduleStadiumLocalization, /sportmonks-venue-13542', '천안축구센터 주경기장', '충청남도 천안시 서북구 축구센터로 150'/);
  assert.match(scheduleStadiumLocalization, /sportmonks-venue-13852', '용인축구센터', '경기도 용인시 처인구 원삼면 보개원삼로 1752'/);
  assert.match(scheduleStadiumLocalization, /sportmonks-venue-14052', '안산 와스타디움', '경기도 안산시 단원구 화랑로 260'/);
  assert.doesNotMatch(scheduleStadiumLocalization, /와~스타디움/);
});

test("일정 화면은 카드와 커스텀 필터, 한국 시간 입력을 제공한다", () => {
  assert.match(scheduleCards, /export function ScheduleCards/);
  assert.match(scheduleCards, /md:grid-cols-2 2xl:grid-cols-3/);
  assert.match(scheduleCards, /<ScheduleDateTimePicker/);
  assert.match(scheduleCards, /showApplyTrigger=\{false\}/);
  assert.match(scheduleCards, /overrides=\{overrides\.get\(fixture\.id\) \?\? \[\]\}/);
  assert.match(scheduleCards, /name="kickoffAt" value={`\$\{kickoffDate\}T\$\{kickoffTime\}`}/);
  assert.doesNotMatch(scheduleCards, /인증 반경 \(m\)/);
  assert.match(actions, /const radiusMeters = 300/);
  assert.match(scheduleCards, /timeZone: "Asia\/Seoul"/);
  assert.match(scheduleCards, /data-\[state=checked\]:bg-primary\/10/);
  assert.match(scheduleCards, /getTeamLogoPath\(teamId\)/);
  assert.match(scheduleCards, /alt={`\$\{teamName\} 엠블럼`}/);
  assert.match(scheduleCards, /\{date\.date\} \(\{date\.weekday\}\) · \{date\.time\}/);
  assert.match(scheduleCards, /fixture\.round === null \? "라운드 미정"/);
  assert.match(scheduleCards, /<TeamSelectOptions teams=\{teams\}/);
  assert.match(scheduleCards, /stadiums=\{stadiums\}/);
  assert.doesNotMatch(scheduleCards, /stadiumsByLeague/);
  assert.match(scheduleCards, /`\$\{fixture\.round\} 라운드`/);
  assert.doesNotMatch(scheduleCards, /leagueLabel\(fixture\.leagueId\)/);
  assert.doesNotMatch(scheduleCards, /<Pencil/);
  assert.match(scheduleCards, /LIVE: \{ dotClass: "bg-red-400"/);
  assert.match(scheduleCards, /FINISHED: \{ dotClass: "bg-zinc-400"/);
  assert.match(scheduleCards, /CANCELED: \{ dotClass: "bg-orange-400"/);
  assert.match(scheduleCards, /<FixtureStatusOption status=\{value\}/);
  assert.match(scheduleCards, /className=\{statusVisual\.badgeClass\}/);
  assert.doesNotMatch(scheduleCards, /coordinateSummary/);
  assert.match(scheduleDateTimePicker, /PopoverPrimitive\.Content/);
  assert.match(scheduleDateTimePicker, /이전 달/);
  assert.match(scheduleDateTimePicker, /aria-label="시 선택"/);
  assert.match(scheduleDateTimePicker, /aria-label="분 선택"/);
  assert.match(scheduleDateTimePicker, /\[scrollbar-width:none\]/);
  assert.match(scheduleDateTimePicker, /touch-pan-y/);
  assert.doesNotMatch(scheduleDateTimePicker, /type="(?:date|time|datetime-local)"/);
});

test("일정 카드에서 일정과 경기 정보를 각각 모달로 수정한다", () => {
  assert.match(scheduleCards, /grid grid-cols-2 gap-2/);
  assert.match(scheduleCards, />일정 수정<\/Button>/);
  assert.match(scheduleCards, /triggerLabel="경기 관리"/);
  assert.match(scheduleCards, /dialogTitle="경기 정보 수정"/);
  assert.match(scheduleCards, /dialogDescription=\{false\}/);
  assert.match(scheduleCards, /submitLabel="수정"/);
  assert.doesNotMatch(scheduleCards, /경기 상세 · 점수 · 라인업/);
  assert.match(entityOverrideControl, /<ScheduleDateTimePicker/);
  assert.doesNotMatch(entityOverrideControl, /type="datetime-local"/);
});

test("경기 정보 수정 이유는 상한 없이 저장된다", () => {
  const migrationNames = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrationNames.indexOf(longReasonMigrationName) > migrationNames.indexOf("202609120006_preserve_verified_player_names_on_sync.sql"));
  assert.match(entityOverrideControl, /name="reason" defaultValue=\{defaultReason\} minLength=\{3\} required/);
  assert.match(actions, /if \(reason\.length < 3\) return \{ status: "error", message: "수정 이유를 3자 이상 입력해 주세요\./);
  assert.match(longReasonMigration, /check \(char_length\(reason\) >= 3\)/);
  assert.doesNotMatch(longReasonMigration, /char_length\(p_reason\) > 1000/);
});
