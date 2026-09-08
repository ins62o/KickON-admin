"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Mail, UsersRound } from "lucide-react";
import { siApple } from "simple-icons";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { DataState } from "@/components/admin/data-state";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAdminUsersData } from "@/lib/admin/console-data";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { useClientData } from "@/lib/client-data";
import { getTeamLogoPath, getTeamName } from "@/lib/data/catalog";
import { formatNumber } from "@/lib/format";

type UserSearchParams = {
  q?: string;
  status?: string;
  team?: string;
  page?: string;
};

const USERS_PER_PAGE = 8;

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

function normalizedPage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function userPageHref(query: UserSearchParams, page: number) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.status) params.set("status", query.status);
  if (query.team) params.set("team", query.team);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/users?${search}` : "/users";
}

function AuthProviderMark({ provider }: { provider: string | null }) {
  if (provider === "email") {
    return (
      <span
        className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-inset ring-primary/20"
        aria-label="이메일 로그인"
        title="이메일 로그인"
      >
        <Mail className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
      </span>
    );
  }

  if (provider === "kakao") {
    return (
      <span
        className="flex size-7 items-center justify-center"
        aria-label="카카오 로그인"
        title="카카오 로그인"
      >
        <Image
          src="/branding/kakao-login.svg"
          width={28}
          height={28}
          alt=""
          className="size-7"
        />
      </span>
    );
  }

  const brand = provider === "apple"
      ? { icon: siApple, label: "애플", className: "bg-[#2F3038] text-white ring-white/10" }
      : null;

  if (!brand) {
    return (
      <span className="flex size-7 items-center justify-center rounded-full bg-muted/35 text-xs font-semibold text-muted-foreground ring-1 ring-inset ring-border/70" aria-label="로그인 방식 확인 필요">
        -
      </span>
    );
  }

  return (
    <span
      className={`flex size-7 items-center justify-center rounded-full ring-1 ring-inset ${brand.className}`}
      aria-label={`${brand.label} 로그인`}
      title={`${brand.label} 로그인`}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
        <path d={brand.icon.path} fill="currentColor" />
      </svg>
    </span>
  );
}

export default function UsersPage() {
  const admin = useRequiredAdminPermission("users.read");
  const searchParams = useSearchParams();
  const { data, error, loading, reload } = useClientData(getAdminUsersData);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "사용자 데이터를 확인할 수 없습니다."} retry={reload} />;
  const query: UserSearchParams = {
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    team: searchParams.get("team") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  };
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
  const totalPages = Math.max(1, Math.ceil(rows.length / USERS_PER_PAGE));
  const currentPage = Math.min(normalizedPage(query.page), totalPages);
  const pageOffset = (currentPage - 1) * USERS_PER_PAGE;
  const paginatedRows = rows.slice(pageOffset, pageOffset + USERS_PER_PAGE);

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
  })).sort((left, right) => (
    right.count - left.count || left.teamName.localeCompare(right.teamName, "ko")
  ));
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
          className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card/35"
          aria-labelledby="team-users-title"
        >
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <UsersRound className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="team-users-title" className="text-base font-semibold text-foreground">팀별 가입자</h2>
              </div>
            </div>
            <AdminStatusBadge label="K리그 1" tone="info" />
          </header>

          <div className="grid flex-1 content-start gap-2 p-4 sm:p-5" role="list" aria-label="가입자 수가 많은 순서의 12개 팀">
            {teamDistribution.map((team) => (
              <div
                key={team.teamId}
                role="listitem"
                className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-lg border border-border/65 bg-background/35 p-3.5"
              >
                <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-background/70">
                  {team.logoPath ? (
                    <Image
                      src={team.logoPath}
                      fill
                      sizes="40px"
                      alt=""
                      className="object-contain p-1.5"
                    />
                  ) : (
                    <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">{team.teamName}</span>
                <strong className="font-sans text-base font-semibold tabular-nums text-foreground">
                  {formatNumber(team.count)}명
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section
          className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card/35"
          aria-labelledby="user-search-title"
        >
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
            <h2 id="user-search-title" className="text-base font-semibold text-foreground">가입자 검색</h2>
            <p className="flex shrink-0 items-baseline gap-1.5 text-sm text-muted-foreground">
              <span>전체 가입자</span>
              <strong className="font-sans text-base font-semibold text-foreground tabular-nums">{formatNumber(data.users.length)}명</strong>
            </p>
          </header>

          <form
            className="grid gap-3 border-b border-border/70 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(190px,1fr)_minmax(160px,0.65fr)_minmax(160px,0.65fr)_auto] xl:items-end"
            role="search"
          >
            <div className="sm:col-span-2 xl:col-span-1">
              <label htmlFor="user-query" className="mb-2.5 block text-sm font-medium text-foreground">사용자 검색</label>
              <Input
                id="user-query"
                name="q"
                defaultValue={query.q ?? ""}
                placeholder="닉네임 또는 사용자 ID"
                aria-label="사용자 검색"
                className="h-11 rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm shadow-inner shadow-black/5 dark:bg-muted/35"
              />
            </div>
            <div>
              <label htmlFor="user-status" className="mb-2.5 block text-sm font-medium text-foreground">계정 상태</label>
              <Select name="status" defaultValue={accountStatusFilter}>
                <SelectTrigger
                  id="user-status"
                  className="h-11! w-full rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
                  <SelectItem value="all" className="py-2 pr-8 pl-2.5">
                    <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                    계정 상태
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
              <label htmlFor="user-team" className="mb-2.5 block text-sm font-medium text-foreground">응원 팀</label>
              <Select name="team" defaultValue={teamFilter}>
                <SelectTrigger
                  id="user-team"
                  className="h-11! w-full rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
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
              <Button type="submit" className="h-11 flex-1 rounded-xl px-4 text-sm">
                검색
              </Button>
              {hasFilters ? (
                <Button asChild variant="ghost">
                  <Link href="/users">초기화</Link>
                </Button>
              ) : null}
            </div>
          </form>

          <div className="flex items-center border-b border-border/70 px-4 py-3 sm:px-5">
            <h3 className="text-base font-semibold text-foreground">사용자 목록</h3>
          </div>

          <div className="hidden grid-cols-[40px_minmax(120px,1fr)_minmax(120px,0.8fr)_auto] items-center gap-3.5 border-b border-border/70 bg-muted/15 px-5 py-3 text-xs font-semibold text-muted-foreground sm:grid">
            <span className="col-span-2">사용자</span>
            <span>응원 팀</span>
            <span>로그인</span>
          </div>

          {rows.length > 0 ? (
            <div className="flex-1 divide-y divide-border/70">
              {paginatedRows.map((user) => {
                const teamLogoPath = user.teamId ? getTeamLogoPath(user.teamId) : null;

                return (
                  <Link
                    key={user.id}
                    href={`/users/detail/?userId=${encodeURIComponent(user.id)}`}
                    aria-label={`${user.nickname} 사용자 정보 보기`}
                    className="grid cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 p-4 outline-none transition-colors hover:bg-primary/[0.06] focus-visible:bg-primary/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[40px_minmax(120px,1fr)_minmax(120px,0.8fr)_auto] sm:p-5"
                  >
                      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-background/70">
                        {teamLogoPath ? (
                          <Image
                            src={teamLogoPath}
                            fill
                            sizes="40px"
                            alt=""
                            className="object-contain p-1.5"
                          />
                        ) : (
                          <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold text-foreground">{user.nickname}</span>
                        <span className="mt-0.5 block truncate text-xs font-medium text-foreground sm:hidden">
                          {user.teamName ?? "응원 팀 미선택"}
                        </span>
                      </span>
                      <span className="hidden min-w-0 truncate text-sm font-medium text-foreground sm:block">
                        {user.teamName ?? "응원 팀 미선택"}
                      </span>
                      <AuthProviderMark provider={user.authProvider} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <DataState kind="empty" title="조건에 맞는 사용자가 없습니다" hideDescription compact className="flex-1" />
          )}

          {rows.length > 0 ? (
            <nav className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-border/70 px-4 py-3.5 sm:px-5" aria-label="사용자 목록 페이지">
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={userPageHref(query, currentPage - 1)} scroll={false}>
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      이전
                    </Link>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    이전
                  </Button>
                )}
                <span className="min-w-16 text-center text-xs font-medium tabular-nums text-muted-foreground">
                  {formatNumber(currentPage)} / {formatNumber(totalPages)}
                </span>
                {currentPage < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={userPageHref(query, currentPage + 1)} scroll={false}>
                      다음
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    다음
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
