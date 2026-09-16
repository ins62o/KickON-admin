"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { invalidateAdminData, useClientData } from "@/lib/client-data";
import { environmentLabel, useConsoleEnvironment } from "@/lib/environment";
import { formatKoreaDateTime } from "@/lib/format";
import { auditRoleLabel } from "@/lib/data/audit";
import { cancelAppRelease, getLatestAppReleaseChange, getAppReleaseHistory, getAppReleases, saveAppRelease, type AppRelease } from "@/lib/admin/app-releases";

function ReleaseForm({ platform, release, canEdit, onSaved }: {
  platform: AppRelease["platform"]; release?: AppRelease; canEdit: boolean; onSaved: () => void;
}) {
  const [version, setVersion] = useState(release?.version ?? "");
  const [savedVersion, setSavedVersion] = useState(release?.version ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const latest = useClientData(() => getLatestAppReleaseChange(platform), [platform, release?.updated_at]);
  const canCancel = Boolean(release && latest.data && latest.data.action !== "APP_RELEASE_CANCEL" &&
    latest.data.after_value.updated_at === release.updated_at);
  const label = platform === "android" ? "Google Play" : "App Store";
  const validVersion = /^\d+(?:\.\d+){0,3}$/.test(version.trim()) && version.trim().length <= 40;
  const hasChanges = version.trim() !== savedVersion;

  function resetInputs() {
    setVersion(savedVersion);
    setMessage(null); setFailed(false);
  }

  async function cancelSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !canCancel || !latest.data || pending) return;
    setPending(true); setMessage(null); setFailed(false);
    try {
      await cancelAppRelease(platform, String(latest.data.id), cancelReason);
      setVersion(latest.data.before_value?.version ?? release?.version ?? "");
      setSavedVersion(latest.data.before_value?.version ?? release?.version ?? "");
      setCancelReason(""); setCancelOpen(false);
      setMessage(`${label} 저장을 취소했습니다.`);
      onSaved();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "저장 취소에 실패했습니다.");
    } finally { setPending(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canEdit || !validVersion || !hasChanges) return;
    setPending(true); setMessage(null); setFailed(false);
    try {
      const changeReason = `${label} 설정 저장: 출시 버전 ${version.trim()}, 업데이트 안내 켜짐`;
      await saveAppRelease(platform, version.trim(), true, changeReason);
      setSavedVersion(version.trim());
      setMessage(`${label} 설정을 저장했습니다.`);
      onSaved();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally { setPending(false); }
  }

  return <><form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="pb-2 text-base font-semibold">{label}</h2>
    <div className="space-y-2.5">
      <label htmlFor={`${platform}-version`} className="block text-sm font-semibold">출시 버전</label>
      <Input id={`${platform}-version`} className="h-11 rounded-xl px-3.5 text-sm" value={version} onChange={event => { setVersion(event.target.value); setMessage(null); setFailed(false); }} placeholder="예: 1.0.3" pattern="[0-9]+(\.[0-9]+){0,3}" maxLength={40} required disabled={!canEdit || pending} />
    </div>
    {message ? <p role={failed ? "alert" : "status"} className={`text-sm ${failed ? "text-danger" : "text-success"}`}>{message}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={!canEdit || pending || !validVersion || !hasChanges}>{pending ? "처리 중…" : "저장"}</Button>
      {hasChanges ? <Button type="button" variant="outline" disabled={pending} onClick={resetInputs}>취소</Button> : null}
      <Button type="button" variant="ghost" className="ml-auto text-muted-foreground" disabled={!canEdit || pending || latest.loading || !canCancel} onClick={() => { setCancelReason(""); setMessage(null); setFailed(false); setCancelOpen(true); }}>이전 설정 복원</Button>
    </div>
    {latest.error ? <p role="alert" className="text-sm text-danger">{latest.error} <button type="button" className="underline" onClick={() => void latest.reload()}>다시 시도</button></p> : null}
  </form>
    <AlertDialog open={cancelOpen} onOpenChange={open => { if (!pending) setCancelOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} 저장 취소</AlertDialogTitle>
          <AlertDialogDescription>{latest.data?.before_value ? `${releaseSummary(latest.data.before_value)}으로 복원합니다.` : "업데이트 안내를 끕니다."}</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={cancelSave} className="space-y-4">
          <div className="space-y-2.5">
            <label htmlFor={`${platform}-cancel-reason`} className="block text-sm font-semibold">취소 사유</label>
            <Input className="h-11 rounded-xl px-3.5 text-sm" id={`${platform}-cancel-reason`} value={cancelReason} onChange={event => setCancelReason(event.target.value)} required minLength={3} maxLength={1000} disabled={pending} placeholder="예: 출시 버전을 잘못 입력함" />
          </div>
          {failed && message ? <p role="alert" className="text-sm text-danger">{message}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>돌아가기</AlertDialogCancel>
            <Button type="submit" disabled={pending || !canCancel}>{pending ? "취소 중…" : "저장 취소하기"}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

export function AppReleaseManager({ embedded = false }: { embedded?: boolean }) {
  const admin = useRequiredAdminPermission("system.read");
  const environment = useConsoleEnvironment();
  const { data, error, loading, reload } = useClientData(getAppReleases, [admin?.userId, environment]);
  if (!admin || loading) return <ClientPageLoading label="앱 업데이트 설정을 불러오고 있습니다." />;
  if (error || !data) return <ClientPageError message={error ?? "설정을 불러오지 못했습니다."} retry={reload} />;
  const canEdit = admin.role === "admin" || admin.role === "super_admin";
  return <div className={embedded ? "space-y-6" : "mx-auto w-full max-w-[1720px] space-y-6 px-4 py-6 lg:px-6 lg:py-7"}>
    {!embedded ? <PageHeader title="앱 업데이트" /> : null}
    <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{environmentLabel(environment)}</span>
    {!canEdit ? <p className="text-sm text-muted-foreground">설정 변경은 관리자 또는 최고 관리자만 가능합니다.</p> : null}
    <div className="grid gap-5 lg:grid-cols-2">
      {(["android", "ios"] as const).map(platform => {
        const release = data.find(item => item.platform === platform);
        return <ReleaseForm key={`${environment}:${platform}`} platform={platform} release={release} canEdit={canEdit} onSaved={invalidateAdminData} />;
      })}
    </div>
    <ReleaseHistory key={environment} userId={admin.userId} />
  </div>;
}

function releaseSummary(release: AppRelease | null) {
  return release ? `${release.version} · ${release.enabled ? "안내 중" : "안내 꺼짐"}` : "미등록";
}

function ReleaseHistory({ userId }: { userId: string }) {
  const { data, error, loading, reload } = useClientData(getAppReleaseHistory, [userId]);
  const [page, setPage] = useState(1);
  const pageSize = 3;
  const pageCount = Math.max(1, Math.ceil((data?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleHistory = data?.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <details className="group space-y-4" aria-label="앱 업데이트 변경 이력">
    <summary className="cursor-pointer text-sm font-semibold">최근 변경 이력</summary>
    {pageCount > 1 ? <nav className="flex items-center justify-end gap-2" aria-label="앱 업데이트 이력 페이지">
      <Button type="button" variant="outline" size="icon" aria-label="이전 이력 페이지" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="size-4" /></Button>
      <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{currentPage} / {pageCount}</span>
      <Button type="button" variant="outline" size="icon" aria-label="다음 이력 페이지" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight className="size-4" /></Button>
    </nav> : null}
    {loading ? <p className="text-sm text-muted-foreground">변경 이력을 불러오고 있습니다.</p> : error ?
      <ClientPageError message={error} retry={reload} /> : !data?.length ?
        <p className="text-sm text-muted-foreground">아직 변경 이력이 없습니다.</p> :
        <ul className="h-[330px] overflow-y-auto divide-y divide-border rounded-xl border border-border bg-card">
          {visibleHistory?.map(item => <li key={item.id}>
            <div className="p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{item.entity_id === "android" ? "Google Play" : "App Store"}</span>
                  {item.action === "APP_RELEASE_CANCEL" ? <span className="text-xs text-muted-foreground">저장 취소</span> : null}
                </div>
                <div className="flex items-center gap-2 text-sm tabular-nums">
                  <span className="text-muted-foreground">{item.before_value?.version ?? "미등록"}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="font-semibold">{item.after_value.version}</span>
                </div>
                <p className="text-xs text-muted-foreground"><time dateTime={item.created_at}>{formatKoreaDateTime(item.created_at)}</time> · {auditRoleLabel(item.actor_role)}</p>
              </div>
            </div>
          </li>)}
        </ul>}
  </details>;
}
