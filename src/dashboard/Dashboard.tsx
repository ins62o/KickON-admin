import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Image, Headset, MessagesSquare, UsersRound, type LucideIcon } from "lucide-react";
import type { AdminIdentity } from "../auth/policy";
import { authClient, authConfig } from "../auth/client";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { AdminHeader } from "./AdminHeader";
import { pages, pageFromUrl, pageUrl, operationTabFromUrl, type OperationTab, type Page } from "./navigation";
import { DashboardBodySkeleton } from "./DashboardSkeleton";
import { ActivityChart, ProviderGauge } from "./DashboardCharts";
import { Toast } from "../components/Toast";
import { CustomSelect } from "../components/CustomSelect";
import { readDashboard, syncStatus, type DashboardData } from "./data";
import "./dashboard.css";
import {Refresh} from "../management/WorkspaceUI";
import {UsersWorkspace} from "../management/UsersWorkspace";
import {OperationsWorkspace} from "../management/OperationsWorkspace";
import {DataWorkspace} from "../management/DataWorkspace";
import {SyncDetailDialog} from "../management/SyncOverview";
import {syncTask} from "../management/sync-model";
import type {SyncJob} from "../management/data";
import "../management/workspace.css";

const statusLabels = { normal: "완료", error: "오류", unknown: "미확인" };
const syncName=(key:string)=>syncTask(key).name;
function time(value: string | null) {
  if (!value) return "—";
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return <time className="sync-timestamp" dateTime={value}><span>{part("month")}월 {part("day")}일</span>{" "}<strong>{part("hour")}:{part("minute")}</strong></time>;
}

function Metric({ label, value, unit, icon: Icon, loading, href, onClick }: { href: string; onClick: (event: MouseEvent<HTMLAnchorElement>) => void; label: string; value: number | null; unit: "명" | "건"; icon: LucideIcon; loading: boolean }) {
  return <a className="overview-metric overview-metric-link" href={href} onClick={onClick} aria-label={`${label} 목록 보기`}>
    <div className="metric-heading"><h2>{label}</h2><span className="metric-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.7} /></span></div>
    {loading ? <div className="metric-skeleton" aria-label="불러오는 중" /> : <strong className="metric-value">{value === null ? "—" : <AnimatedNumber value={value}/>}<span className="metric-unit">{value !== null ? unit : ""}</span></strong>}
  </a>;
}

export function Dashboard({ admin, pending, error, signOut }: { admin: AdminIdentity; pending: boolean; error: string; signOut: () => Promise<void> }) {
  const [page, setPage] = useState<Page>(()=>pageFromUrl(window.location.href));
  const [usersVisited,setUsersVisited]=useState(page==="users");
  if(page==="users"&&!usersVisited)setUsersVisited(true);
  const [operationTab,setOperationTab]=useState<OperationTab>(()=>operationTabFromUrl(window.location.href));
  const navigate=(next:Page,tab:OperationTab="community")=>{
    if(next===page&&(next!=="operations"||tab===operationTab))return;
    window.history.pushState(null,"",pageUrl(window.location.href,next,tab));
    setPage(next);setOperationTab(tab);
  };
  const metricLink=(next:Page,tab:OperationTab="community")=>({
    href:pageUrl(window.location.href,next,tab),
    onClick:(event:MouseEvent<HTMLAnchorElement>)=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();navigate(next,tab);
    },
  });
  useEffect(()=>{
    const restore=()=>{setPage(pageFromUrl(window.location.href));setOperationTab(operationTabFromUrl(window.location.href));};
    window.addEventListener("popstate",restore);
    return()=>window.removeEventListener("popstate",restore);
  },[]);
  const content=useRef<HTMLElement>(null);
  const [period,setPeriod]=useState(7);
  const [data, setData] = useState<DashboardData>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedSync,setSelectedSync]=useState<SyncJob|null>(null);
  if(page!=="dashboard"&&selectedSync)setSelectedSync(null);
  const refresh = () => { setLoading(true); setRevision(value => value + 1); };
  useEffect(() => {
    if(page!=="dashboard")return;
    let disposed = false;
    void readDashboard(authClient,authConfig?.providerAllowance??null,authConfig?.environment).then(result => {
      if (disposed) return;
      setData(result); setLoading(false);
    });
    return () => { disposed = true; };
  }, [revision,page]);
  useEffect(()=>{
    if(page!=="dashboard")return;
    const update=()=>{if(!document.hidden)setRevision(value=>value+1);};
    const resetAt=Date.parse(data?.provider.resetAt??"");
    const delay=resetAt>Date.now()?Math.min(60000,resetAt-Date.now()+100):60000;
    const timer=setTimeout(update,delay);
    document.addEventListener("visibilitychange",update);
    return()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",update);};
  },[page,data]);
  useEffect(() => {
    document.title = `KICKON | ${pages[page]}`;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const animation=content.current?.animate([{opacity:.3,transform:"translateY(7px)"},{opacity:1,transform:"translateY(0)"}],{duration:240,easing:"cubic-bezier(.2,.7,.2,1)"});
    return()=>animation?.cancel();
  }, [page]);
  const total = data?.summary.totalProfiles ?? null;
  const rows = (data?.sync ?? []).filter(row => syncName(row.sync_key).toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()) && (filter === "all" || syncStatus(row) === filter));
  const hasError = data && Object.values(data.errors).some(Boolean);
  const warning = error || (page === "dashboard" && !loading && hasError ? "일부 현황을 불러오지 못했어요" : "");
  return <div className="dashboard-screen">
    <a href="#dashboard-main" className="skip-link">본문으로 바로가기</a>
    <div className="dashboard-shell">
      <AdminHeader admin={admin} page={page} onNavigate={navigate} pending={pending} signOut={signOut}/>
      <main ref={content} id="dashboard-main" tabIndex={-1} className="dashboard-main">
        <div className="dashboard-title-row"><h1>{pages[page]}</h1>{page === "dashboard" ? <div className="dashboard-actions"><Refresh onClick={refresh} disabled={loading}/></div> : null}</div>
        {warning ? <Toast key={`${revision}:${warning}`} message={warning} /> : null}
        <div className="console-content">
        <div hidden={page !== "dashboard"}>
        {loading ? <DashboardBodySkeleton/> : <>
        <section className="overview-grid" aria-label="운영 요약" aria-busy={loading}>
          <Metric {...metricLink("users")} label="전체 사용자" value={total} unit="명" icon={UsersRound} loading={loading} />
          <Metric {...metricLink("operations","community")} label="커뮤니티" value={data?.metrics.posts ?? null} unit="건" icon={MessagesSquare} loading={loading} />
          <Metric {...metricLink("operations","attendances")} label="직관 인증" value={data?.metrics.attendances ?? null} unit="건" icon={Image} loading={loading} />
          <Metric {...metricLink("operations","inquiries")} label="1:1 문의" value={data?.metrics.openInquiries ?? null} unit="건" icon={Headset} loading={loading} />
        </section>
        <div className="dashboard-charts"><ActivityChart trend={data?.trend} failed={Boolean(data?.errors.trend)} period={period} onPeriodChange={setPeriod}/>{data?<ProviderGauge quota={data.provider} failed={data.errors.provider}/>:null}</div>
        <section id="sync" className="dashboard-panel sync-panel" aria-labelledby="sync-heading">
          <div className="panel-heading"><h2 id="sync-heading">최근 동기화</h2><div className="sync-controls"><input type="search" aria-label="동기화 작업 검색" placeholder="작업 검색" value={search} onChange={event => setSearch(event.target.value)} /><CustomSelect label="동기화 상태" value={filter} onChange={setFilter} options={[{value:"all",label:"전체"},{value:"normal",label:"완료"},{value:"error",label:"오류"}]} /></div></div>
          <div className="sync-table-wrap"><table><thead><tr><th scope="col">작업</th><th scope="col">최근 시도</th><th scope="col">최근 완료</th><th scope="col">상태</th></tr></thead><tbody>{!loading && !data?.errors.sync ? rows.map(row => { const status = syncStatus(row); return <tr key={row.sync_key} className="sync-row" onClick={event=>{event.currentTarget.querySelector("button")?.focus({preventScroll:true});setSelectedSync({...row,season:null,league_id:null});}}><th scope="row"><button type="button" className="sync-row-trigger" aria-haspopup="dialog">{syncName(row.sync_key)}</button></th><td>{time(row.last_attempted_at)}</td><td>{time(row.last_succeeded_at)}</td><td><span className={`sync-status sync-status-${status}`}><i aria-hidden="true" />{statusLabels[status]}</span></td></tr>; }) : null}</tbody></table></div>
          {loading || data?.errors.sync || !rows.length ? <div className="sync-empty" role="status">{loading ? "동기화 기록 불러오는 중" : data?.errors.sync ? "동기화 기록을 불러오지 못했어요" : search || Boolean(data?.sync.length) ? "검색 결과 없음" : "아직 동기화 기록이 없어요"}</div> : null}
        </section>
        </>}
        </div>
        <div hidden={page!=="users"}>{usersVisited?<UsersWorkspace active={page==="users"}/>:null}</div>
        {selectedSync?<SyncDetailDialog selection={{kind:"state",job:selectedSync}} onClose={()=>setSelectedSync(null)}/>:null}
        {page === "operations" ? <OperationsWorkspace admin={admin} tab={operationTab} onTabChange={tab=>navigate("operations",tab)}/> : page === "data" ? <DataWorkspace admin={admin}/> : null}
        </div>
      </main>
    </div>
  </div>;
}
