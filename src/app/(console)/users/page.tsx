import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Search, UsersRound } from "lucide-react";
import { DataState } from "@/components/admin/data-state";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAdminUsersData } from "@/lib/admin/console-data";
import { accountStatusLabel, statusTone } from "@/lib/admin/labels";
import { requireAdminPermission } from "@/lib/auth/server";
import { getTeamLogoPath, getTeamName } from "@/lib/data/catalog";
import { formatNumber, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "사용자" };

type UserSearchParams = {
  q?: string;
  status?: string;
  team?: string;
};

const USER_TEAM_IDS = [
  "incheon",
  "seoul",
  "jeonbuk",
  "ulsan",
  "daejeon",
  "pohang",
  "anyang",
  "bucheon",
  "gangwon",
  "jeju",
  "gwangju",
  "gimcheon",
] as const;

function UserMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-xs font-semibold text-foreground">
        {value === null ? "-" : formatNumber(value)}
      </dd>
    </div>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<UserSearchParams> }) {
  await requireAdminPermission("users.read");
  const query = await searchParams;
  const data = await getAdminUsersData();
  const keyword = query.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const accountStatusFilter = query.status === "ACTIVE" || query.status === "SUSPENDED"
    ? query.status
    : "all";
  const teamFilter = query.team && (USER_TEAM_IDS as readonly string[]).includes(query.team)
    ? query.team
    : "all";
  const rows = data.users.filter((user) => {
    if (keyword && ![user.nickname, user.id, user.teamName].filter(Boolean).some((value) => String(value).toLocaleLowerCase("ko-KR").includes(keyword))) return false;
    if (accountStatusFilter !== "all" && (user.accountStatus ?? "ACTIVE") !== accountStatusFilter) return false;
    if (teamFilter !== "all" && user.teamId !== teamFilter) return false;
    return true;
  });

  const teamUserCounts = new Map<string, number>(USER_TEAM_IDS.map((teamId) => [teamId, 0]));
  const teamNamesFromUsers = new Map(
    data.users
      .filter((user) => user.teamId && user.teamName)
      .map((user) => [user.teamId as string, user.teamName as string]),
  );

  for (const user of data.users) {
    if (user.teamId && teamUserCounts.has(user.teamId)) {
      teamUserCounts.set(user.teamId, (teamUserCounts.get(user.teamId) ?? 0) + 1);
    }
  }

  const teamDistribution = USER_TEAM_IDS.map((teamId) => ({
    teamId,
    teamName: teamNamesFromUsers.get(teamId) ?? getTeamName(teamId),
    logoPath: getTeamLogoPath(teamId),
    count: teamUserCounts.get(teamId) ?? 0,
  }));
  const maxTeamUserCount = Math.max(1, ...teamDistribution.map((team) => team.count));
  const hasFilters = Boolean(
    keyword ||
    accountStatusFilter !== "all" ||
    teamFilter !== "all",
  );

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader title="사용자" />

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section
          className="overflow-hidden rounded-xl border border-border/80 bg-card/35"
          aria-labelledby="team-users-title"
        >
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <UsersRound className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="team-users-title" className="text-sm font-semibold text-foreground">팀별 가입자</h2>
              </div>
            </div>
            <AdminStatusBadge label="K리그 1" tone="info" />
          </header>

          <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5" role="list" aria-label="12개 팀별 가입자 수">
            {teamDistribution.map((team) => {
              const barWidth = team.count === 0 ? 0 : Math.max(6, (team.count / maxTeamUserCount) * 100);

              return (
                <div
                  key={team.teamId}
                  role="listitem"
                  className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/65 bg-background/35 p-3"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/70 p-1.5">
                    {team.logoPath ? (
                      <Image
                        src={team.logoPath}
                        width={28}
                        height={28}
                        alt=""
                        className="object-contain"
                      />
                    ) : (
                      <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground">{team.teamName}</span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${barWidth}%` }}
                      />
                    </span>
                  </span>
                  <strong className="font-sans text-sm font-semibold tabular-nums text-foreground">
                    {formatNumber(team.count)}명
                  </strong>
                </div>
              );
            })}
          </div>
        </section>

        <section
          className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card/35"
          aria-labelledby="user-search-title"
        >
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
            <h2 id="user-search-title" className="text-sm font-semibold text-foreground">가입자 검색</h2>
            <p className="flex shrink-0 items-baseline gap-1.5 text-xs text-muted-foreground">
              <span>전체 가입자</span>
              <strong className="font-sans text-sm font-semibold text-foreground tabular-nums">{formatNumber(data.users.length)}명</strong>
            </p>
          </header>

          <form
            className="grid gap-3 border-b border-border/70 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(190px,1fr)_minmax(140px,0.55fr)_minmax(150px,0.65fr)_auto] xl:items-end"
            role="search"
          >
            <div className="sm:col-span-2 xl:col-span-1">
              <label htmlFor="user-query" className="mb-2.5 block text-xs font-medium text-foreground">사용자 검색</label>
              <Input
                id="user-query"
                name="q"
                defaultValue={query.q ?? ""}
                placeholder="닉네임 또는 사용자 ID"
                aria-label="사용자 검색"
                className="h-10 rounded-xl border-border/80 bg-muted/35 px-3 shadow-inner shadow-black/5 dark:bg-muted/35"
              />
            </div>
            <div>
              <label htmlFor="user-status" className="mb-2.5 block text-xs font-medium text-foreground">계정 상태</label>
              <Select name="status" defaultValue={accountStatusFilter}>
                <SelectTrigger
                  id="user-status"
                  className="h-10! w-full rounded-xl border-border/80 bg-muted/35 px-3 font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
                  <SelectItem value="all" className="py-2 pr-8 pl-2.5">
                    <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                    모든 계정 상태
                  </SelectItem>
                  <SelectItem value="ACTIVE" className="py-2 pr-8 pl-2.5">
                    <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    정상
                  </SelectItem>
                  <SelectItem value="SUSPENDED" className="py-2 pr-8 pl-2.5">
                    <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
                    정지
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="user-team" className="mb-2.5 block text-xs font-medium text-foreground">응원 팀</label>
              <Select name="team" defaultValue={teamFilter}>
                <SelectTrigger
                  id="user-team"
                  className="h-10! w-full rounded-xl border-border/80 bg-muted/35 px-3 font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
                  <SelectItem value="all" className="py-2 pr-8 pl-2.5">
                    <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                      <UsersRound className="size-3" />
                    </span>
                    모든 응원 팀
                  </SelectItem>
                  {teamDistribution.map((team) => (
                    <SelectItem key={team.teamId} value={team.teamId} className="py-2 pr-8 pl-2.5">
                      {team.logoPath ? (
                        <Image src={team.logoPath} width={20} height={20} alt="" className="object-contain" />
                      ) : null}
                      {team.teamName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-1">
              <Button type="submit" className="h-10 flex-1 rounded-xl">
                <Search className="size-3.5" aria-hidden="true" />
                검색
              </Button>
              {hasFilters ? (
                <Button asChild variant="ghost">
                  <Link href="/users">초기화</Link>
                </Button>
              ) : null}
            </div>
          </form>

          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
            <h3 className="text-xs font-semibold text-foreground">사용자 목록</h3>
            <span className="font-sans text-xs text-muted-foreground">{formatNumber(rows.length)}명</span>
          </div>

          {rows.length > 0 ? (
            <div className="flex-1 divide-y divide-border/70">
              {rows.map((user) => (
                <article key={user.id} className="p-4 sm:p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/users/${user.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary">
                        <span className="truncate">{user.nickname}</span>
                        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                      </Link>
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{user.id}</p>
                    </div>
                    <AdminStatusBadge
                      label={accountStatusLabel(user.accountStatus)}
                      tone={statusTone(user.accountStatus)}
                      size="compact"
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-foreground">{user.teamName ?? "응원 팀 미선택"}</span>
                    <span className="shrink-0 text-muted-foreground">
                      최근 활동 {user.recentActivityAt ? formatRelativeTime(user.recentActivityAt) : "기록 없음"}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    <UserMetric label="게시글" value={user.postCount} />
                    <UserMetric label="댓글" value={user.commentCount} />
                    <UserMetric label="직관" value={user.attendanceCount} />
                    <UserMetric label="누적 신고" value={user.reportCount} />
                    <UserMetric label="경고" value={user.warningCount} />
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <DataState kind="empty" title="조건에 맞는 사용자가 없습니다" hideDescription compact className="flex-1" />
          )}
        </section>
      </div>
    </div>
  );
}
