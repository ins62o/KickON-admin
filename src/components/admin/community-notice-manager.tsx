"use client";

import Image from "next/image";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Megaphone, UsersRound } from "lucide-react";

import { ActionSubmit } from "@/components/admin/action-submit";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { DataState } from "@/components/admin/data-state";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createCommunityNoticeAction,
  deleteCommunityNoticeAction,
  initialAdminActionState,
} from "@/lib/admin/actions";
import {
  getCommunityNoticeData,
  type CommunityNoticeRecord,
  type CommunityNoticeTeam,
} from "@/lib/admin/community-notices";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getTeamLogoPath } from "@/lib/data/catalog";

const noticeDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const K_LEAGUE_1_TEAM_IDS = new Set([
  "incheon", "seoul", "jeonbuk", "ulsan", "daejeon", "pohang",
  "anyang", "bucheon", "gangwon", "jeju", "gwangju", "gimcheon",
]);

function formatNoticeDateTime(value: string) {
  const parts = noticeDateTimeFormatter.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}월 ${part("day")}일 ${part("dayPeriod")} ${part("hour")}:${part("minute")}분`;
}

function ActionMessage({ state }: { state: { status: string; message: string | null } }) {
  return state.message ? (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}
    >
      {state.message}
    </p>
  ) : null;
}

function NoticeCreateForm({ teams, onSuccess }: { teams: CommunityNoticeTeam[]; onSuccess: (message: string) => void }) {
  const [state, action, pending] = useActionState(createCommunityNoticeAction, initialAdminActionState);
  const [board, setBoard] = useState<"LEAGUE" | "TEAM">("LEAGUE");
  const [teamId, setTeamId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dismissedActionMessage, setDismissedActionMessage] = useState<string | null>(null);
  const selectedTeam = teams.find((team) => team.id === teamId);
  const selectedTeamLogo = selectedTeam ? getTeamLogoPath(selectedTeam.id) : null;

  useEffect(() => {
    if (state.status === "success" && state.message) onSuccess(state.message);
  }, [onSuccess, state.message, state.status]);

  const handleBoardChange = (nextBoard: "LEAGUE" | "TEAM") => {
    setBoard(nextBoard);
    if (nextBoard === "LEAGUE") setTeamId("");
  };

  return (
    <form
      action={action}
      className="space-y-5"
      onChangeCapture={() => {
        if (state.status === "error") setDismissedActionMessage(state.message);
      }}
      onSubmitCapture={() => setDismissedActionMessage(null)}
    >
      <input type="hidden" name="board" value={board} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">노출 범위</legend>
        <div className="grid grid-cols-2 gap-2">
          {([["LEAGUE", "전체 공지"], ["TEAM", "팀별 공지"]] as const).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary">
              <input type="radio" name="boardOption" value={value} checked={board === value} onChange={() => handleBoardChange(value)} disabled={pending || (value === "TEAM" && teams.length === 0)} className="accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {board === "TEAM" ? (
        <div className="space-y-2">
          <label htmlFor="notice-team" className="block text-sm font-semibold">기준 팀 (K리그 1)</label>
          <Select name="teamId" value={teamId} onValueChange={setTeamId} disabled={pending} required>
              <SelectTrigger
                id="notice-team"
                className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"
                aria-label="기준 팀"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  {selectedTeamLogo ? (
                    <Image src={selectedTeamLogo} width={22} height={22} alt="" className="size-[22px] shrink-0 object-contain" />
                  ) : (
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                      <UsersRound className="size-3.5" />
                    </span>
                  )}
                  <span className={selectedTeam ? "truncate text-foreground" : "truncate text-muted-foreground"}>{selectedTeam?.name ?? "팀을 선택해 주세요"}</span>
                </span>
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
                {teams.map((team) => {
                  const logoPath = getTeamLogoPath(team.id);
                  return (
                    <SelectItem key={team.id} value={team.id} className="min-h-11 cursor-pointer py-2.5 pr-8 pl-2.5">
                      {logoPath ? (
                        <Image src={logoPath} width={22} height={22} alt="" className="size-[22px] shrink-0 object-contain" />
                      ) : (
                        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                          <UsersRound className="size-3.5" />
                        </span>
                      )}
                      <span className="truncate">{team.name}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="notice-title" className="text-sm font-semibold">제목</label>
          <span className="text-xs tabular-nums text-muted-foreground">{title.length}/100</span>
        </div>
        <Input id="notice-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={100} required disabled={pending} className="h-11" placeholder="공지 제목을 입력해 주세요" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="notice-content" className="text-sm font-semibold">내용</label>
          <span className="text-xs tabular-nums text-muted-foreground">{content.length.toLocaleString("ko-KR")}/10,000</span>
        </div>
        <Textarea id="notice-content" name="content" value={content} onChange={(event) => setContent(event.target.value)} minLength={5} maxLength={10_000} required disabled={pending} rows={9} className={board === "LEAGUE" ? "min-h-[308px] resize-y" : "min-h-[216px] resize-y"} placeholder="사용자에게 안내할 내용을 입력해 주세요" />
      </div>

      {state.message === dismissedActionMessage ? null : <ActionMessage state={state} />}
      <DialogFooter className="mx-0 mb-0 px-0 pb-0">
        <ActionSubmit className="h-10! px-5">공지 등록</ActionSubmit>
      </DialogFooter>
    </form>
  );
}

function NoticeDetail({ notice, canWrite, onClose, onDelete }: { notice: CommunityNoticeRecord; canWrite: boolean; onClose: () => void; onDelete: (notice: CommunityNoticeRecord) => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <AdminStatusBadge label={notice.board === "LEAGUE" ? "전체 공지" : "팀별 공지"} tone="info" />
          </div>
          <DialogTitle className="text-xl leading-7">{notice.title}</DialogTitle>
          <DialogDescription>
            {notice.board === "TEAM" ? `${notice.teamName} · ` : ""}{formatNoticeDateTime(notice.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-48 whitespace-pre-wrap break-words rounded-lg border border-border/80 bg-background p-4 text-sm leading-7 text-foreground/90">{notice.content}</div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" className="h-9! px-4" onClick={onClose}>닫기</Button>
          {canWrite ? (
            <Button type="button" variant="destructive" size="sm" className="h-9! px-4" onClick={() => onDelete(notice)}>삭제</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoticeDeleteDialog({ notice, onClose, onSuccess }: { notice: CommunityNoticeRecord; onClose: () => void; onSuccess: (message: string) => void }) {
  const [state, action, pending] = useActionState(deleteCommunityNoticeAction, initialAdminActionState);

  useEffect(() => {
    if (state.status === "success" && state.message) onSuccess(state.message);
  }, [onSuccess, state.message, state.status]);

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>공지사항을 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="font-semibold text-foreground">{notice.title}</strong> 공지가 목록과 사용자 앱에서 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="noticeId" value={notice.id} />
          <ActionMessage state={state} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button" className="h-9! px-4" disabled={pending}>취소</AlertDialogCancel>
            <ActionSubmit variant="destructive" className="h-9! px-4" pendingLabel="삭제 중…">삭제</ActionSubmit>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CommunityNoticeManager() {
  const admin = useRequiredAdminPermission("moderation.read");
  const { data, error, loading, reload } = useClientData(getCommunityNoticeData);
  const [createOpen, setCreateOpen] = useState(false);
  const [createVersion, setCreateVersion] = useState(0);
  const [selectedNotice, setSelectedNotice] = useState<CommunityNoticeRecord | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<CommunityNoticeRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [noticeScope, setNoticeScope] = useState<"LEAGUE" | "TEAM">("LEAGUE");
  const [teamFilter, setTeamFilter] = useState("__all");
  const canWrite = Boolean(admin && hasAdminPermission(admin.role, "moderation.write"));
  const kLeagueOneTeams = data?.teams.filter((team) => K_LEAGUE_1_TEAM_IDS.has(team.id)) ?? [];
  const activeTeamFilter = teamFilter === "__all" || kLeagueOneTeams.some((team) => team.id === teamFilter)
    ? teamFilter
    : "__all";
  const selectedFilterTeam = kLeagueOneTeams.find((team) => team.id === activeTeamFilter);
  const selectedFilterTeamLogo = selectedFilterTeam ? getTeamLogoPath(selectedFilterTeam.id) : null;
  const filteredNotices = data?.notices.filter((notice) => (
    notice.board === noticeScope
    && (noticeScope === "LEAGUE" || activeTeamFilter === "__all" || notice.teamId === activeTeamFilter)
  )) ?? [];

  const handleSuccess = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
    setCreateOpen(false);
    setSelectedNotice(null);
    setDeleteNotice(null);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (open) {
      setMessage(null);
      setCreateVersion((version) => version + 1);
    }
  };

  if (!admin || loading) return <ClientPageLoading label="공지사항을 불러오고 있습니다." />;
  if (error || !data) return <ClientPageError message={error ?? "공지사항 데이터를 확인할 수 없습니다."} retry={reload} />;

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader
        title="공지사항"
        actions={canWrite ? (
          <Button type="button" size="sm" className="h-10! px-4" onClick={() => handleCreateOpenChange(true)}>
            공지 작성
          </Button>
        ) : null}
        actionsLabel="공지사항 관리"
      />

      {message ? <div role="status" className="mt-5 border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}
      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="notice-list-title">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
          <h2 id="notice-list-title" className="text-base font-semibold">등록된 공지</h2>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{filteredNotices.length}건</p>
        </div>
        <div className="border-b border-border/70 px-5 py-3">
          <Tabs value={noticeScope} onValueChange={(value) => setNoticeScope(value as "LEAGUE" | "TEAM")} className="w-full">
            <TabsList aria-label="공지 노출 범위" className="grid h-14! w-full grid-cols-2">
              <TabsTrigger value="LEAGUE" className="font-bold text-white data-active:text-white">전체 공지</TabsTrigger>
              <TabsTrigger value="TEAM" className="font-bold text-white data-active:text-white">팀별 공지</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {noticeScope === "TEAM" ? (
          <div className="flex items-center justify-end gap-3 border-b border-border/70 px-5 py-3">
            <label htmlFor="notice-team-filter" className="text-xs font-semibold text-muted-foreground">대상 팀</label>
            <Select value={activeTeamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger id="notice-team-filter" className="h-11! w-60 rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50" aria-label="대상 팀 필터">
                <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {selectedFilterTeamLogo ? (
                    <Image src={selectedFilterTeamLogo} width={20} height={20} alt="" className="size-5 shrink-0 object-contain" />
                  ) : (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                      <UsersRound className="size-3" />
                    </span>
                  )}
                  <span className="truncate">{selectedFilterTeam?.name ?? "전체 팀"}</span>
                </span>
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="w-(--radix-select-trigger-width)">
                <SelectItem value="__all" className="min-h-11 cursor-pointer py-2.5 pr-8 pl-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                    <UsersRound className="size-3" />
                  </span>
                  <span>전체 팀</span>
                </SelectItem>
                {kLeagueOneTeams.map((team) => {
                  const logoPath = getTeamLogoPath(team.id);
                  return (
                    <SelectItem key={team.id} value={team.id} className="min-h-11 cursor-pointer py-2.5 pr-8 pl-2.5">
                      {logoPath ? (
                        <Image src={logoPath} width={20} height={20} alt="" className="size-5 shrink-0 object-contain" />
                      ) : (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                          <UsersRound className="size-3" />
                        </span>
                      )}
                      <span>{team.name}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6">제목</TableHead>
              {noticeScope === "TEAM" ? <TableHead className="w-72 px-8 text-center">대상 팀</TableHead> : null}
              <TableHead className="w-64 px-8">등록 시각</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredNotices.length > 0 ? filteredNotices.map((notice) => (
              <TableRow
                key={notice.id}
                role="button"
                tabIndex={0}
                aria-label={`${notice.title} 상세 보기`}
                className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => setSelectedNotice(notice)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedNotice(notice);
                  }
                }}
              >
                <TableCell className="max-w-lg px-6 py-4 text-sm font-semibold">{notice.title}</TableCell>
                {noticeScope === "TEAM" ? (
                  <TableCell className="w-72 px-8 py-4 text-sm text-muted-foreground">
                    <span className="flex items-center justify-center gap-2">
                      {getTeamLogoPath(notice.teamId) ? (
                        <Image src={getTeamLogoPath(notice.teamId)!} width={24} height={24} alt="" className="size-6 shrink-0 object-contain" />
                      ) : (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                          <UsersRound className="size-3.5" />
                        </span>
                      )}
                      <span className="truncate">{notice.teamName}</span>
                    </span>
                  </TableCell>
                ) : null}
                <TableCell className="w-64 px-8 py-4 text-sm text-muted-foreground">{formatNoticeDateTime(notice.createdAt)}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={noticeScope === "TEAM" ? 3 : 2}><DataState kind="empty" title={`등록된 ${noticeScope === "LEAGUE" ? "전체" : "팀별"} 공지가 없습니다`} description={canWrite ? "공지 작성 버튼으로 공지를 등록해 주세요." : "공지사항이 등록되면 이곳에 표시됩니다."} icon={Megaphone} compact /></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>공지 작성</DialogTitle></DialogHeader>
          <NoticeCreateForm key={createVersion} teams={kLeagueOneTeams} onSuccess={handleSuccess} />
        </DialogContent>
      </Dialog>

      {selectedNotice ? <NoticeDetail notice={selectedNotice} canWrite={canWrite} onClose={() => setSelectedNotice(null)} onDelete={(notice) => { setSelectedNotice(null); setDeleteNotice(notice); }} /> : null}
      {deleteNotice ? <NoticeDeleteDialog notice={deleteNotice} onClose={() => setDeleteNotice(null)} onSuccess={handleSuccess} /> : null}
    </div>
  );
}
