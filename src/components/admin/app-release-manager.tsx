"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { invalidateAdminData, useClientData } from "@/lib/client-data";
import { environmentLabel, useConsoleEnvironment } from "@/lib/environment";
import { formatKoreaFullDateTime } from "@/lib/format";
import { auditRoleLabel } from "@/lib/data/audit";
import { cancelAppRelease, getLatestAppReleaseChange, getAppReleaseHistory, getAppReleases, saveAppRelease, type AppRelease } from "@/lib/admin/app-releases";

function ReleaseForm({ platform, release, canEdit, onSaved }: {
  platform: AppRelease["platform"]; release?: AppRelease; canEdit: boolean; onSaved: () => void;
}) {
  const [version, setVersion] = useState(release?.version ?? "");
  const [enabled, setEnabled] = useState(release?.enabled ?? false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const latest = useClientData(() => getLatestAppReleaseChange(platform), [platform, release?.updated_at]);
  const canCancel = Boolean(release && latest.data && latest.data.action !== "APP_RELEASE_CANCEL" &&
    latest.data.after_value.updated_at === release.updated_at);
  const label = platform === "android" ? "Android · Google Play" : "iPhone · App Store";

  function resetInputs() {
    setVersion(release?.version ?? ""); setEnabled(release?.enabled ?? false);
    setReason(""); setMessage(null); setFailed(false);
  }

  async function cancelSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !canCancel || !latest.data || pending) return;
    setPending(true); setMessage(null); setFailed(false);
    try {
      await cancelAppRelease(platform, String(latest.data.id), cancelReason);
      setVersion(latest.data.before_value?.version ?? release?.version ?? "");
      setEnabled(latest.data.before_value?.enabled ?? false);
      setReason(""); setCancelReason(""); setCancelOpen(false);
      setMessage(`${label} 저장을 취소했습니다.`);
      onSaved();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "저장 취소에 실패했습니다.");
    } finally { setPending(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canEdit) return;
    setPending(true); setMessage(null); setFailed(false);
    try {
      await saveAppRelease(platform, version.trim(), enabled, reason);
      setMessage(`${label} 설정을 저장했습니다.`);
      setReason("");
      onSaved();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally { setPending(false); }
  }

  return <><form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-5">
    <div className="space-y-1">
      <h2 className="text-base font-semibold">{label}</h2>
      <p className="text-sm text-muted-foreground">이 플랫폼에서 입력한 버전보다 낮은 버전의 사용자에게만 표시합니다.</p>
      <p className="text-xs text-muted-foreground">현재 설정: {release?.version ?? "미등록"} · {release?.enabled ? "안내 중" : "안내 꺼짐"}</p>
      {release ? <p className="text-xs text-muted-foreground">마지막 변경: {formatKoreaFullDateTime(release.updated_at)}</p> : null}
    </div>
    <div className="space-y-2">
      <label htmlFor={`${platform}-version`} className="text-sm font-medium">출시 버전</label>
      <Input id={`${platform}-version`} value={version} onChange={event => setVersion(event.target.value)} placeholder="예: 1.0.3" pattern="[0-9]+(\.[0-9]+){0,3}" maxLength={40} required disabled={!canEdit || pending} />
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={!canEdit || pending} />
      업데이트 안내 표시
    </label>
    <div className="space-y-2">
      <label htmlFor={`${platform}-reason`} className="text-sm font-medium">변경 사유</label>
      <Input id={`${platform}-reason`} value={reason} onChange={event => setReason(event.target.value)} placeholder="예: 새 버전 스토어 배포 완료" minLength={3} maxLength={1000} required disabled={!canEdit || pending} />
    </div>
    {message ? <p role={failed ? "alert" : "status"} className={`text-sm ${failed ? "text-danger" : "text-success"}`}>{message}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={!canEdit || pending}>{pending ? "처리 중…" : "설정 저장"}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={resetInputs}>입력 취소</Button>
      <Button type="button" variant="outline" disabled={!canEdit || pending || latest.loading || !canCancel} onClick={() => { setCancelReason(""); setMessage(null); setFailed(false); setCancelOpen(true); }}>저장 취소</Button>
    </div>
    {latest.error ? <p role="alert" className="text-sm text-danger">{latest.error} <button type="button" className="underline" onClick={() => void latest.reload()}>다시 시도</button></p> : null}
  </form>
    <AlertDialog open={cancelOpen} onOpenChange={open => { if (!pending) setCancelOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} 저장 취소</AlertDialogTitle>
          <AlertDialogDescription>이 플랫폼의 마지막 저장을 취소합니다. {latest.data?.before_value ? `이전 설정(${releaseSummary(latest.data.before_value)})으로 되돌립니다.` : "처음 등록한 설정은 업데이트 안내를 끕니다."} 취소 사유와 변경 전후 값은 이력에 기록됩니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={cancelSave} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor={`${platform}-cancel-reason`} className="text-sm font-medium">취소 사유</label>
            <Input id={`${platform}-cancel-reason`} value={cancelReason} onChange={event => setCancelReason(event.target.value)} required minLength={3} maxLength={1000} disabled={pending} placeholder="예: 출시 버전을 잘못 입력함" />
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
    {!embedded ? <PageHeader title="앱 업데이트" description="Android와 iOS의 출시 버전과 업데이트 안내를 각각 관리합니다." /> : null}
    <p className="text-sm font-medium">{environmentLabel(environment)}의 실제 설정입니다. 저장하면 이 서버를 사용하는 앱에 반영됩니다.</p>
    <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">스토어에 업데이트가 배포된 후 안내를 켜 주세요. 같은 버전 또는 상위 버전에는 표시하지 않습니다. 사용자가 라벨을 누르면 해당 플랫폼의 스토어로 이동합니다.</p>
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
  return <section className="space-y-4" aria-label="앱 업데이트 변경 이력">
    <h2 className="text-base font-semibold">최근 변경 이력</h2>
    {loading ? <p className="text-sm text-muted-foreground">변경 이력을 불러오고 있습니다.</p> : error ?
      <ClientPageError message={error} retry={reload} /> : !data?.length ?
        <p className="text-sm text-muted-foreground">아직 변경 이력이 없습니다.</p> :
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.map(item => <li key={item.id} className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link className="font-medium underline underline-offset-4" href={`/audit/detail/?auditId=${encodeURIComponent(item.id)}`}>
                {item.entity_id === "android" ? "Android" : "iOS"} · {formatKoreaFullDateTime(item.created_at)}
              </Link>
              <span className="text-muted-foreground">{auditRoleLabel(item.actor_role)}</span>
            </div>
            <p>{item.action === "APP_RELEASE_CANCEL" ? "저장 취소 · " : ""}{releaseSummary(item.before_value)} → {releaseSummary(item.after_value)}</p>
            <p className="break-words text-muted-foreground">{item.reason}</p>
          </li>)}
        </ul>}
    <p className="text-xs text-muted-foreground">최근 50건을 표시합니다. 전체 기록과 작업자는 관리자 변경 기록에서 확인할 수 있습니다.</p>
  </section>;
}
