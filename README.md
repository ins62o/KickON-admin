# KICKON administrator

React + Vite + TypeScript + Tailwind CSS. Canonical project: /Users/inseong/MINE/kickon/admin.

Use Node 24.15 or later (.nvmrc selects Node 24). The private monitoring server uses Node's built-in SQLite module; no separate database service is needed.

## 환경 설정

- .env.development.example와 .env.production.example는 빈 설정 템플릿이며 Vite가 자동으로 읽는 실제 환경 파일이 아니다
- 새 환경에서만 해당 예제를 .env.development.local 또는 .env.production.local로 복사해 필요한 값을 설정한다. 기존 로컬 파일을 덮어쓰지 않는다
- 템플릿에는 실제 프로젝트 주소·계정·키를 넣지 않는다. 비어 있는 URL/키는 인증 연결이 설정됐다는 뜻이 아니다
- NEXT_PUBLIC_KICKON_* 이름은 현재 설정 로더가 유지하는 호환 이름이다. React/Vite에서도 해당 공개 연결을 사용한다
- 브라우저 설정은 URL과 publishable/anon 공개 키만 허용한다. Secret·service-role·Provider·Management 키에는 VITE_ 또는 NEXT_PUBLIC_ 접두사를 붙이지 않는다
- 서버 전용 항목은 사용하는 기능에 대해서만 별도로 설정한다. SUPABASE_MONITORING_SOURCE=cloud는 기존 cloud collector가 구성된 환경에서만 지정하며 배포·Cron 생성을 대신하지 않는다

## 실행과 검증

현재 Git 전환은 진행 중이다. 새 코드만 추가하고 과거 Next.js 삭제를 보류한 checkout은 옛 소스·테스트를 다시 포함할 수 있다. 승인된 전환 목록과 CI 정책이 확정되기 전에는 재현 가능한 최종 기준선으로 취급하지 않는다.

- 의존성 설치가 승인된 새 격리 환경에서는 lockfile 기준 npm ci를 사용한다. 네트워크 접근과 패키지 lifecycle 실행 여부를 먼저 확인한다
- 정적 검토 후 승인된 격리 환경에서만 npm test, npm run lint, npm run typecheck를 실행한다. 테스트의 임시 파일·DB·네트워크 영향을 이름만 보고 판단하지 않는다
- npm run build는 Vite 설정을 로드하며 .data/system-metrics.sqlite를 초기화할 수 있다
- npm run dev와 npm run preview도 같은 저장소를 초기화하고, 설정된 자격증명에 따라 실제 API·주기적 수집을 시작할 수 있다. 무해한 검증 명령으로 사용하지 않는다
- 브라우저 및 수동 SQL 검사는 별도 fixture·런타임·격리 조건을 확인한다. 일부 수동 SQL 도구의 PGlite 런타임은 현재 package/lockfile에 포함돼 있지 않다

## Git 및 운영 자료 보호

- 실제 .env*, Secret, SQLite/WAL/SHM, 인증 상태·HAR, 의존성 및 생성 파일은 Git에 포함하지 않는다. 환경 예제 2개만 빈 템플릿으로 허용한다
- .data는 캐시가 아니다. 실행 중 삭제하거나 단순 복사하지 않는다
- 운영·QA·승인·복구 자료는 현재 위치와 기존 외부 보존본을 유지한다. ignore 규칙은 삭제·이동·과거 승인 재사용을 허용하지 않으며 이미 추적된 파일을 자동 제외하지 않는다
- 아래 QA 링크는 보존 자료의 참조다. 해당 자료를 Git에 포함하지 않은 새 checkout에서는 열리지 않을 수 있다
- Migration 권위 원본·실제 적용 이력·발행 책임자는 미확정이다. [관리 방침](docs/operations/admin-baseline-policy.md)을 따르며 Migration을 자동 복원·병합·실행하지 않는다
- 현재 작업 중인 workflow는 Prod push에 배포가 연결돼 있고, HEAD의 이전 workflow에는 Dev 배포 분기도 있다. workflow와 원격 보호 정책을 확인하기 전에는 기준선 작업을 push하지 않는다

## Admin UI and browser checks

The admin uses official SEED Design React components with a Toss blue theme. See [design decisions](docs/design/admin-design.md) and [the 2026-10-19 verification report](docs/qa/2026-10-19-seed-admin/report.md).

With Chrome installed and `npm run dev` running in another terminal, run `npm run test:browser`. The suite uses isolated fixture responses and blocks external network requests; it does not modify operational data. `QA_BASE_URL`, `QA_ARTIFACT_DIR` and `QA_FILTER` select the local server, artifact destination and scenario filter.

## Sign-in and dashboard

The initial page is the approved-style KICKON administrator login. The dashboard mounts only after Supabase `getUser()` and an active, recognized `admin_users` role are verified. Logout returns to sign-in. A restored session is verified again.

The dashboard uses the existing read-only contracts:

- `admin_get_dashboard_summary`: app-member count excluding administrators/service accounts and sync failures from the last 24 hours
- `admin_get_dashboard_metrics`: cumulative community posts, attendance verifications, and unanswered inquiries
- `admin_get_active_user_trend`: Korea-time DAU and rolling 30-day MAU, with the tracking-start date respected
- `football_sync_state`: eight most recently attempted jobs, with recorded success/error/unknown results
- `/api/admin/provider-usage`: authenticated, active-admin-only live Fixture quota measurement
- `get_admin_provider_usage`: fallback to the latest recorded Fixture quota observation

The chart supports 7/14/30 days and keyboard selection. Sync jobs can be searched and filtered. Mobile shows job, last success, and status; desktop also shows last attempt. Counts of zero remain zero; unavailable data stays unknown. The sports API gauge reads the actual Fixture quota through the private server and uses the configured per-entity hourly allowance. It refreshes while the dashboard is visible, once per minute, after the quota resets, and when the tab becomes visible again. Live requests are deduplicated and cached server-side for at most one minute, never beyond the provider reset. A fresh recorded observation is used if the live endpoint is unavailable. Missing, expired, or inconsistent observations remain unknown. It never assumes a reset restored the allowance. A completed daily or one-time job is never called delayed based on a generic time threshold.

These reads use the signed-in user and existing database authorization. Reads use existing authorization. Management mutations use existing audited RPCs or a role-checked server route. The notice-editing change adds only `admin_update_community_notice` through the migration below; QA does not edit live service content or grant accounts. Live production sign-in, deployed RPC availability, and live database access policies have not been checked. The former reset source and the approved agency landing remain in the earlier backups; this task does not restore removed administration modules.

Header navigation keeps the shared header and account controls mounted while switching the content area between 대시보드, 사용자, 운영 관리, and 데이터 관리. The management sections provide the user directory, operations inboxes/marketing studio, and data workspaces. Dashboard data and chart/filter state remain mounted when switching sections. The user directory mounts lazily on its first visit and then retains its roster, activity aggregates, filters, expanded clubs and page in memory across menu/history navigation. Returning does not refetch; the user refresh/retry controls reload the three readers. Leaving closes its detail dialog. Sign-out, a different administrator, an environment reload or a full page reload discards that view state. The dashboard refresh control is an accessible icon-only button; no last-refreshed timestamp is displayed.

## Configuration

The build exposes only explicitly configured development/production Supabase URLs, publishable keys, and a validated numeric provider allowance. The account menu selects a validated environment. If the same account already has a verified target session it is reused; otherwise the private server verifies a source session, checks existing active recognized administrator membership in both projects, matches verified email addresses, and exchanges a one-use target login token. Passwords are never saved or replayed, and tokens never enter URLs. The target keeps its own SDK storage key, with getUser and membership reverified after navigation. Explicit logout signs out both local environment sessions; a failed sign-in rolls back only the current session. The login header also offers environment selection so an unavailable target account cannot trap the user. Server secrets remain private. `npm run build -- --mode design-preview` disables real authentication and never grants demo access. Test servers and fixture data are outside production source.

## UI conventions

Headings have no generic explanatory subtitle. Text buttons have no decorative trailing icon. Headings, labels, buttons, and incomplete phrases have no terminal full stop. These conventions are also recorded in `AGENTS.md`.

## Theme control

The circular logo in the login and dashboard header switches between light and dark themes with a flip animation. Both faces use official logo assets. The selected theme is saved locally and applied before the app mounts. The button supports keyboard activation, and reduced-motion settings disable the animation. Login credentials are not remounted when the theme changes. The login footer contains only the KICKON copyright.

Validation, sign-in failures, and dashboard warnings use the shared bottom toast. It dismisses after six seconds and pauses while hovered or focused; the close button dismisses it immediately. Native form-validation bubbles are disabled, and required/email checks still run before sign-in.

## Fonts

Korean text uses the bundled Pretendard Variable v1.3.9 font from `public/fonts/pretendard`, with its original SIL Open Font License included. The shared sans-serif stack puts Inter first for Latin letters and numbers, then Pretendard Variable for Korean. The login heading keeps Source Serif 4 italic. The local Korean font is preloaded and supplies weights 45–920 across operating systems; it does not depend on locally installed Korean fonts.

## Dashboard motion and availability

The header has an animated active indicator and a person icon that opens account information, environment selection, and logout. Content changes use a short fade/slide; numeric summaries count up over 1.25 seconds. Reduced-motion settings disable these effects. The custom select supports arrows, Home/End, Enter, Escape, and outside/focus dismissal.

Authentication restore and dashboard data loading share a data-free skeleton; private identity and data stay gated by authorization. The activity chart uses blue DAU and yellow MAU lines, preserving missing periods as gaps.

Repaired on 2026-10-20: development was missing `app_daily_activity`, `record_app_activity` and `admin_get_active_user_trend`. The verified production contract and access restrictions were applied to development through `supabase/migrations/202610200001_admin_active_user_trend.sql`, with migration history recorded atomically. Existing recording functions are preserved when this repair is applied elsewhere. All five dashboard reads now succeed. Until the app records actual activity, `trackingStartedOn` remains null and the graph stays empty rather than showing invented history. Production schema and permissions were unchanged. See `docs/qa/2026-10-20-active-user-trend.md` for verification.

## Management workspaces

- Users: current-season K1/K2 and club filters, club fan counts, nickname/ID search, 15-row pages, member details. A stable profile-ID roster excluding admin/email service accounts supplies counts; the recent-activity RPC only enriches those IDs so moving activity cannot duplicate the roster. Activity details missing during concurrent changes remain unknown.
- Operations: visible notice count, pending inquiries and reports, paginated/searchable/filterable lists. Audited RPCs create/edit/hide/restore notices, save inquiry answers/status, and resolve/dismiss reports. Notice hiding and restoring do not prompt for a reason; the actual action is recorded automatically. Notice details include title/content editing with conflict detection to prevent overwriting another administrator’s edit. Report details use the existing authorized `admin_get_content_report` RPC to show the report reason, Korean content type, reporter and actual target-author nicknames; missing nicknames remain unknown. Report processing uses the common keyboard-accessible custom select, while the existing audited status/note save RPC is preserved. Mutation controls respect the existing roles; database authorization remains authoritative.
- Marketing: a fixed official-logo update image template, editable copy/date/version, 1080×1350 feed and 1080×1920 story PNG export. Up to 50 drafts are saved in this browser, separately per environment. Drafts are not shared campaign records or published social posts.
- App updates: Operations → 앱 업데이트 edits Android/iPhone release versions and update-banner visibility separately in the selected environment through the existing audited `admin_set_app_store_release` RPC. Only `admin`/`super_admin` can save; other roles have disabled controls and the server enforces authorization. Recent history shows up to 50 changes. The app already reads `app_store_releases` and displays its existing home banner only when an enabled release is newer than the installed version; it refreshes on home focus and at five-minute intervals. On 2026-10-22, read-only schema checks confirmed the release table, save RPC and audit table in development and production. No live release settings were changed for QA.
- Data: sync and upcoming-match overview, league filters, current-season club records, inclusive Korea-time date ranges and paginated fixtures. Existing schedule RPC preserves the attendance coordinates/radius unless the stadium changes. Scoped manual squad/lineup/team-metrics jobs use a server-only route with role/scope validation and audit records. Pending and quarantined responses finish as partial rather than becoming fake success or permanent running jobs. The Edge squad handler retains ownership of snapshots and reconciliation.

Data subtabs share a persistent tab bar. Monitoring stays mounted and keeps its existing automatic refresh while football tools load on first use and remain mounted across monitoring/tools switches. Returning to a loaded view preserves results, filters and the selected graph period without starting another initial read; explicit refresh still reloads that view. These caches last while the Data workspace remains open.

Club management shows one current-season standings table at a time (K1 by default, K2 through the common league dropdown). Unclassified clubs remain separate. Each standings row is a full-row link to a team detail page (`?page=data&tab=teams&team=…`) containing a searchable roster and team information, with the actual current-season rank at the right of the club heading. Player details/editing open in the shared modal without changing the team URL or roster filters. A SportsMonks name-review notice counts and filters provider-sourced players whose displayed name has no Korean text; those rows are marked. English-only names do not establish an arrival date, and manual registrations are excluded from this provider notice. The row has no squad-sync action; manual sync remains in Sync management. Detail URLs support direct entry, reload and browser history; returning to the existing list retains its league/search state and cached rows. Data editors can update team names/codes and player profile/stat fields with a reason; viewers can only inspect them. Migration `202610200003_admin_team_details.sql` adds scoped, audited RPCs with stale-edit detection, delegates player changes to the existing editor, and protects team display overrides from subsequent provider syncs. Provider IDs and team membership are not editable on this page. Verification: [team details QA](docs/qa/2026-10-20-team-details/report.md), [team page QA](docs/qa/2026-10-20-team-pages/report.md), [player modal/name review QA](docs/qa/2026-10-20-player-modals/report.md).

`npm run dev` and `npm run preview` mount `/api/admin/environment`, `/api/admin/sync`, and `/api/admin/provider-usage` from `server/admin-api.ts`. Per-environment private keys, sync secrets, and `SPORTMONKS_API_TOKEN` (also accepts `SPORTSMONKS_API_TOKEN`) are loaded only on the server, never in the browser bundle. The provider token must be configured privately for each server environment; it is not automatically copied from another project. The usage reader makes a minimal [Fixture request](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-all-fixtures) and reads the returned [rate-limit metadata](https://docs.sportmonks.com/v3/api/rate-limit); only quota fields are returned to the browser. Each uncached measurement consumes one Fixture API call and does not modify application data. A static deployment must route these endpoints to an equivalent private Node handler; uploading `dist` alone does not deploy the private API. Real provider jobs were not run during testing.

Verified on 2026-10-18 after explicit user approval: the existing requested production authentication account was registered as an active admin. Matching verified email identity and active administrator membership are confirmed in both development and production. Environment switching never creates a user or grants a role as a side effect. Live browser handoff was tested with isolated fixtures; real account sign-in was not replayed for this verification.

Pending environment changes are invalidated when explicit logout starts, including logout in another browser tab. Late target sessions are discarded, and a late response cannot redirect or sign the administrator back in.

When the private provider token is missing, the usage endpoint returns `PROVIDER_USAGE_NOT_CONFIGURED` after verifying the administrator. Fresh recorded observations remain usable; after they expire the dashboard shows a connection-configuration notice. An unavailable or zero usage gauge has no colored fill or endpoint dots.


## Server monitoring

Data Management opens the Supabase server monitoring view. `/api/admin/system-metrics` verifies the session and active administrator before returning normalized resource samples. The private server uses the existing per-environment `SUPABASE_METRICS_SECRET_KEY` with the official project Metrics API. CPU is calculated from successive per-core counters; the first sample and counter resets stay unknown. Memory excludes available memory; disk uses `/data`; database connections and data size come from their own Postgres metrics. Resource warnings begin at 80%, critical at 95%; `pg_up=0` is critical independently of resource usage. Collection failure never becomes a healthy sample.

The resource chart selects the latest 1 hour (default), 6 hours, 24 hours or 7 days through the common keyboard-accessible select. The corresponding averages are 5 minutes, 5 minutes, 15 minutes and 1 hour. CPU starts from the collector's five-minute counter rates; longer views average those recorded rates. Memory averages the actual readings over the selected interval. Missing values and collection gaps longer than 150 seconds reset averaging and break their series; real zero remains on the baseline. Fixed time axes use Korea time, with dates in day/week views. Earlier unrecorded portions are marked separately from collection outages. It does not interpolate missing observations.

With `SUPABASE_MONITORING_SOURCE=cloud` in each private environment file, Supabase Cron invokes `collect-admin-resources` every minute independently of the administrator browser, Node server and development computer. Each project keeps its own `admin_resource_samples` for eight days. The Edge Function authenticates a dedicated random cron secret, reads the existing Metrics API, restores the CPU baseline from recent observations and writes measured samples through service-only RPCs. A failed scrape records null resource values, not zero; a failed database write returns an error. Missing records and DB restarts remain visible gaps. Cron itself cannot run while its database is stopped.

The private Node API verifies active administrator membership before reading cloud history. The resource table and RPCs are inaccessible to anonymous and authenticated app users. The scheduler's URL and authentication secret are held in Vault; the metrics key and cron secret are Edge Function secrets. Management/restart tokens are never used by the collector. Only the named collector function and its own cron job are deployed, without pruning other functions or changing existing schedules. Older measured SQLite history is merged during the transition, with cloud records taking precedence in the same minute. History is not backfilled with invented readings.

Without the explicit cloud setting, the previous local collector remains available for development: the Vite dev/preview Node process collects once per minute into `.data/system-metrics.sqlite` while that process is running. Its state-change events are process-local. Cloud mode does not run that local scrape timer. Keep `.data` private and persistent for the DB restart audit ledger and any older measured history; it remains excluded from git/build output and denied by Vite's file server. Uploading static `dist` alone does not deploy the authenticated private API. See [cloud monitoring verification](docs/qa/2026-10-20-cloud-monitoring/report.md) and [period and storage verification](docs/qa/2026-10-20-resource-periods/report.md).

`server/supabase-usage.ts` contains organization-wide Pro billing values verified through the signed-in official Usage page on 2026-10-18. These are deliberately labeled with the billing cycle and verification time and are returned only to authorized administrators of the matching projects. They are not live billing measurements and are not bundled into public frontend assets. The official Usage link provides current values; no plan upgrade, billing changes, account token extraction or new credentials were performed.

## Supabase DB restart button

The monitoring header provides a power icon labeled `DB 서버 재시작` for active `admin`/`super_admin` accounts. Hover presses the button inward, respecting reduced motion. Its confirmation dialog identifies the selected development/production environment, hides the internal project reference, separates cancel/confirm actions by 12px, and explains the temporary interruption to app reads/writes. The confirmed request still validates the exact configured project internally. It uses the official `POST /v1/projects/{ref}/restart` Management API through the private server. Project service keys and publishable keys do not replace the required Management API token.

To connect it:

1. Open [Supabase Access Tokens](https://supabase.com/dashboard/account/tokens) and create a scoped personal access token for the intended project. In the permissions UI, choose **Project Settings → Read-write**. The restart API documents this as `project_admin_write`. Use separate project-scoped tokens when enabling both environments.
2. Add `SUPABASE_MANAGEMENT_ACCESS_TOKEN=your_token` to `.env.development.local` for development and/or `.env.production.local` for production. Keep it server-only; do not use a `VITE_` or `NEXT_PUBLIC_` prefix. The existing private metrics configuration for that environment must remain present.
3. Reload/restart the private administrator server. The execution button remains disabled in the dialog until that environment has a configured token. A configured token is not proof of sufficient provider permissions; Supabase rejection is reported without claiming a restart occurred.

The endpoint independently verifies the signed-in administrator, active membership, exact allowed role, environment, configured project reference and explicit confirmation. It does not accept a project URL, Management token or shell command from the browser. Every operation is reserved in the private SQLite audit ledger before dispatch. Request IDs bind to the project, environment and authenticated actor. Duplicate IDs are not dispatched again, even after reopening the store; uncertain/accepted operations impose a five-minute project cooldown across server processes. Timeouts and upstream 5xx responses remain uncertain and are never retried automatically. A 2xx result acknowledges the request, not completed recovery; the existing monitoring/restart detection confirms later observations.

These changes were tested with temporary local ledgers and fake provider responses. No actual development or production restart was run for QA. See [restart verification](docs/qa/2026-10-20-database-restart/report.md).

Official sources: https://supabase.com/docs/guides/observability/metrics and https://supabase.com/docs/guides/platform/manage-your-usage

Marketing management provides Instagram templates for updates, events, and notices. Each category has an editor, live preview, feed (1080 × 1350) and story (1080 × 1920) PNG export, and caption copying. Drafts stay in this browser and environment; existing update drafts retain their titles, features, dates, and versions. Saved drafts can be searched, reopened, duplicated, and deleted after confirmation. Unsaved edits are retained when switching content categories, and replacing them with another draft prompts to save or discard. Export rejects overflowing content rather than silently clipping it. Instagram publishing and shared/cloud draft storage are not connected.

### Notice editing

`supabase/migrations/202610190001_admin_update_community_notice.sql` adds the notice-only editor. Applied directly through the authenticated Supabase CLI to the configured development and production projects on 2026-10-19. The function uses existing `moderation.write` authorization, leaves the official author, board, team, images and visibility untouched, locks the selected notice, rejects stale title/content, and writes the edit and before/after audit record in one transaction. An audit failure rolls back the edit. Unchanged content creates no duplicate audit entry. Only authenticated callers can execute it, and active administrator capability is still checked inside the function.

Validation: 86 Node tests passed, including five notice-action tests; production build and changed-file ESLint passed. Isolated PostgreSQL verification covered denied anonymous/read-only callers, notice-only targeting, content limits, stale edits, rollback on audit failure, and unchanged visibility/author/scope. No live notice was edited or hidden for QA. The frontend has not been deployed as part of this change.
