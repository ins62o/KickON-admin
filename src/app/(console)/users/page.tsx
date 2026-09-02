import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Search, UsersRound } from "lucide-react";
import { DataState } from "@/components/admin/data-state";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminUsersData } from "@/lib/admin/console-data";
import { accountStatusLabel, statusTone } from "@/lib/admin/labels";
import { requireAdminPermission } from "@/lib/auth/server";
import { formatNumber, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "사용자" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; team?: string }> }) {
  await requireAdminPermission("users.read");
  const query = await searchParams;
  const data = await getAdminUsersData();
  const keyword = query.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const rows = data.users.filter((user) => {
    if (keyword && ![user.nickname, user.id, user.teamName].filter(Boolean).some((value) => String(value).toLocaleLowerCase("ko-KR").includes(keyword))) return false;
    if (query.status && query.status !== "all" && (user.accountStatus ?? "ACTIVE") !== query.status) return false;
    if (query.team && query.team !== "all" && (user.teamId ?? "none") !== query.team) return false;
    return true;
  });
  const teams = [...new Map(data.users.filter((user) => user.teamId).map((user) => [user.teamId, user.teamName ?? user.teamId])).entries()];
  const teamUserCounts = new Map<string, { teamId: string | null; teamName: string; count: number }>();
  for (const user of data.users) {
    const key = user.teamId ?? "none";
    const current = teamUserCounts.get(key);
    teamUserCounts.set(key, {
      teamId: user.teamId,
      teamName: user.teamName ?? "응원 팀 미선택",
      count: (current?.count ?? 0) + 1,
    });
  }
  const teamDistribution = [...teamUserCounts.values()].sort((a, b) => (
    b.count - a.count || a.teamName.localeCompare(b.teamName, "ko")
  ));
  const maxTeamUserCount = Math.max(1, ...teamDistribution.map((team) => team.count));

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader context="OPERATIONS" title="사용자" description="가입자, 응원 팀, 활동량, 누적 신고와 계정 상태를 확인합니다." status={!data.enhancementsReady ? <AdminStatusBadge label="제재 스키마 적용 필요" tone="warning" /> : undefined} />
      {data.error ? <div className="mt-5"><DataState kind="unavailable" title="일부 사용자 정보를 확인할 수 없습니다" description={data.error} compact /></div> : null}
      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="user-overview-title">
        <header className="flex items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <UsersRound className="size-4" aria-hidden="true" />
          </span>
          <h2 id="user-overview-title" className="text-base font-semibold">사용자 현황</h2>
        </header>
        <div className="grid gap-px bg-border/70 lg:grid-cols-2">
          <div className="bg-card/45 p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">팀별 가입자 수</h3>
            {teamDistribution.length > 0 ? (
              <div className="space-y-1.5" role="list" aria-label="팀별 가입자 수 가로 막대그래프">
                {teamDistribution.map((team) => {
                  const teamValue = team.teamId ?? "none";
                  const selected = (query.team ?? "all") === teamValue;
                  const barWidth = Math.max(3, (team.count / maxTeamUserCount) * 100);
                  return (
                    <Link
                      key={teamValue}
                      href={`/users?team=${encodeURIComponent(teamValue)}`}
                      aria-current={selected ? "page" : undefined}
                      role="listitem"
                      className={selected
                        ? "grid min-h-10 grid-cols-[minmax(80px,150px)_minmax(80px,1fr)_48px] items-center gap-2 rounded-md bg-primary/10 px-2.5 py-2 text-primary sm:gap-3"
                        : "grid min-h-10 grid-cols-[minmax(80px,150px)_minmax(80px,1fr)_48px] items-center gap-2 rounded-md px-2.5 py-2 transition-colors hover:bg-primary/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"}
                    >
                      <span className="truncate text-sm font-medium">{team.teamName}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-muted/70" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${barWidth}%` }}
                        />
                      </span>
                      <strong className="tabular text-right text-sm font-semibold text-foreground">{formatNumber(team.count)}명</strong>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="flex min-h-14 items-center text-sm text-muted-foreground">집계할 사용자가 없습니다.</p>
            )}
          </div>
          <div className="flex min-h-32 flex-col bg-card/45 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-foreground">가입자 현황</h3>
            <div className="flex flex-1 flex-col justify-center py-4">
              <p className="text-sm font-medium text-muted-foreground">전체 가입자</p>
              <p className="tabular mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {formatNumber(data.users.length)}명
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="user-list-title">
        <div className="border-b border-border/70 px-4 py-3.5"><h2 id="user-list-title" className="text-sm font-semibold">사용자 목록</h2><p className="mt-0.5 text-xs text-muted-foreground">닉네임·사용자 ID 검색과 상태·팀 필터를 지원합니다.</p></div>
        <form className="grid gap-2 border-b border-border/70 p-3 sm:grid-cols-[minmax(220px,1fr)_180px_200px_auto]" role="search">
          <Input name="q" defaultValue={query.q} placeholder="닉네임 또는 사용자 ID" aria-label="사용자 검색" />
          <select name="status" defaultValue={query.status ?? "all"} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">모든 계정 상태</option><option value="ACTIVE">정상</option><option value="SUSPENDED">정지</option><option value="DEACTIVATED">비활성</option></select>
          <select name="team" defaultValue={query.team ?? "all"} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">모든 응원 팀</option><option value="none">미선택</option>{teams.map(([id, name]) => <option key={id} value={id ?? ""}>{name}</option>)}</select>
          <Button type="submit" size="sm"><Search className="size-3.5" />검색</Button>
        </form>
        <div className="overflow-x-auto">
          <Table className="min-w-[1040px]">
            <TableHeader><TableRow><TableHead>사용자</TableHead><TableHead>응원 팀</TableHead><TableHead className="text-right">게시글</TableHead><TableHead className="text-right">댓글</TableHead><TableHead className="text-right">직관</TableHead><TableHead className="text-right">누적 신고</TableHead><TableHead className="text-right">경고</TableHead><TableHead>최근 활동</TableHead><TableHead>계정 상태</TableHead><TableHead className="text-right">상세</TableHead></TableRow></TableHeader>
            <TableBody>{rows.length > 0 ? rows.map((user) => <TableRow key={user.id}><TableCell><p className="text-xs font-medium">{user.nickname}</p><p className="mt-0.5 max-w-52 truncate font-mono text-[10px] text-muted-foreground">{user.id}</p></TableCell><TableCell className="text-xs">{user.teamName ?? "미선택"}</TableCell><TableCell className="text-right font-mono text-xs">{user.postCount ?? "-"}</TableCell><TableCell className="text-right font-mono text-xs">{user.commentCount ?? "-"}</TableCell><TableCell className="text-right font-mono text-xs">{user.attendanceCount ?? "-"}</TableCell><TableCell className="text-right font-mono text-xs">{user.reportCount ?? "-"}</TableCell><TableCell className="text-right font-mono text-xs">{user.warningCount ?? "-"}</TableCell><TableCell className="text-xs text-muted-foreground">{user.recentActivityAt ? formatRelativeTime(user.recentActivityAt) : "기록 없음"}</TableCell><TableCell><AdminStatusBadge label={accountStatusLabel(user.accountStatus)} tone={statusTone(user.accountStatus)} size="compact" /></TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/users/${user.id}`}>보기<ArrowUpRight className="size-3.5" /></Link></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={10}><DataState kind="empty" title="조건에 맞는 사용자가 없습니다" compact /></TableCell></TableRow>}</TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
