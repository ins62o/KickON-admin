import {TeamMark} from "./TeamMark";
import {useCallback,useState} from "react";
import {memberAccountState,dateLabel,leagueLabel,type Member,type Team} from "./model";
import {readUserHistory} from "./data";
import type {MemberHistoryKind} from "./member-history";
import {useResource} from "./useResource";
import {Badge,Dialog,Empty,Pager,Stat,WorkspaceSkeleton,WorkspaceTabs} from "./WorkspaceUI";
export function MemberStatus({status}:{status:string}){
  const state=memberAccountState(status);
  const tone={active:"normal",suspended:"error",unknown:"unknown"}[state];
  return <span className={`sync-status sync-status-${tone}`}><i aria-hidden="true"/>{({active:"정상",suspended:"정지",unknown:"미확인"})[state]}</span>;
}
const labels={posts:"작성 게시글",comments:"작성 댓글",attendances:"직관 인증"};
const resultLabels={WIN:"승",DRAW:"무",LOSS:"패",PENDING:"예정",UNKNOWN:"미확인"};
const visibility:Record<string,string>={VISIBLE:"공개",HIDDEN:"숨김",DELETED:"삭제"};
function MemberHistoryPanel({userId,kind,active}:{userId:string;kind:MemberHistoryKind;active:boolean}){
  const [page,setPage]=useState(1);
  const load=useCallback(()=>readUserHistory(userId,kind,page),[userId,kind,page]);
  const history=useResource(load),summary=history.data?.attendanceSummary;
  return <div className="member-history-panel" hidden={!active} aria-label={labels[kind]} aria-busy={history.loading}>
    {history.loading?<WorkspaceSkeleton/>:history.error?<Empty error={history.error} retry={history.reload}/>:<>
      {summary?<div className="member-attendance-summary"><div><span>직관 승률</span><strong>{`${(summary.winRate??0).toLocaleString("ko-KR",{maximumFractionDigits:1})}%`}</strong></div><span>{summary.wins}승 {summary.draws}무 {summary.losses}패</span></div>:null}
      {!history.data?.rows.length?<Empty message={`${labels[kind]} 내역이 없어요`}/>:<div className="member-history-list">{history.data.rows.map(row=>kind==="attendances"?<article className="member-history-item member-attendance-item" key={row.id}><div className="member-attendance-info"><strong>{row.title}</strong><div className="member-history-meta"><span>{row.context}</span><time dateTime={row.createdAt}>{dateLabel(row.createdAt,true)}</time></div></div><span className="attendance-result" data-result={row.result??"UNKNOWN"} aria-label={`직관 결과: ${resultLabels[row.result??"UNKNOWN"]}`}>{resultLabels[row.result??"UNKNOWN"]}</span></article>:<details className="member-history-item" key={row.id}><summary><strong>{row.title}</strong><span className="member-history-meta"><span>{row.context}</span><time dateTime={row.createdAt}>{dateLabel(row.createdAt,true)}</time>{row.status?<Badge>{visibility[row.status]??"미확인"}</Badge>:null}</span></summary><p>{row.content||"본문이 없어요"}</p></details>)}</div>}
      {history.data?.total?<Pager page={page} total={history.data.total} onChange={setPage}/>:null}
    </>}
  </div>;
}
export function MemberDetailDialog({member,team,league,onClose}:{member:Member;team:Team|undefined;league:string|null;onClose:()=>void}){
  const [kind,setKind]=useState<MemberHistoryKind>("posts");
  return <Dialog title="사용자 상세정보" className="member-detail-dialog" dismissOnBackdrop onClose={onClose}>
    <div className="member-profile"><h3>{member.nickname||"이름 없음"}</h3><MemberStatus status={member.account_status}/></div>
    <dl className="workspace-details member-details"><div><dt>사용자 ID</dt><dd>{member.user_id}</dd></div><div><dt>응원 구단</dt><dd className="member-team">{team?<TeamMark team={team}/>:null}<span>{member.team_name||"미선택"}</span></dd></div><div><dt>리그</dt><dd>{leagueLabel(league)}</dd></div><div><dt>가입일</dt><dd>{dateLabel(member.joined_at,true)}</dd></div><div><dt>최근 활동</dt><dd>{dateLabel(member.recent_activity_at,true)}</dd></div></dl>
    <div className="workspace-stats compact"><Stat label="게시글" value={member.post_count} unit="건"/><Stat label="댓글" value={member.comment_count} unit="건"/><Stat label="직관 인증" value={member.attendance_count} unit="건"/></div>
    <section className="member-history" aria-label="사용자 활동 내역">
      <WorkspaceTabs value={kind} items={Object.entries(labels).map(([value,label])=>({value,label}))} onChange={value=>setKind(value as MemberHistoryKind)}/>
      <div className="member-history-panels">{(["posts","comments","attendances"] as const).map(value=><MemberHistoryPanel key={value} userId={member.user_id} kind={value} active={kind===value}/>)}</div>
    </section>
  </Dialog>;
}
