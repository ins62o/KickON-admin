import {AttendanceDetailDialog} from "./AttendanceDetailDialog";
import {TeamMark} from "./TeamMark";
import {useCallback,useState} from "react";
import type {ActivityKind,ActivityRow} from "./activity-list";
import {readAllActivity} from "./data";
import {dateLabel} from "./model";
import {useResource} from "./useResource";
import {Badge,Dialog,Empty,NumberedPager,SearchField,WorkspaceSkeleton} from "./WorkspaceUI";
const results={WIN:"승리",DRAW:"무승부",LOSS:"패배",PENDING:"예정",UNKNOWN:"미확인"};
const visibility:Record<string,string>={VISIBLE:"게시 중",HIDDEN:"숨김",DELETED:"삭제"};
export function ActivityWorkspace({kind}:{kind:ActivityKind}){
  const [page,setPage]=useState(1),[query,setQuery]=useState(""),[selected,setSelected]=useState<ActivityRow|null>(null);
  const load=useCallback(()=>readAllActivity(kind,page,query),[kind,page,query]);
  const activity=useResource(load),community=kind==="community";
  return <section className="workspace-panel activity-workspace">
    <div className="workspace-toolbar"><h2>{community?"커뮤니티":"직관 인증"} <span className="inline-count">{activity.data?`${activity.data.total.toLocaleString("ko-KR")}건`:""}</span></h2><div className="workspace-tools"><SearchField value={query} onChange={value=>{setQuery(value);setPage(1);}} placeholder={community?"제목 · 내용 · 작성자 검색":"사용자 · 구단 · 경기장 검색"}/></div></div>
    {activity.loading?<WorkspaceSkeleton rowHeight={community?64:73}/>:activity.error?<Empty error={activity.error} retry={activity.reload}/>:<>
      <div className="workspace-table-wrap">
        <table className={`workspace-table activity-table ${community?"community-table":"attendance-table"}`}>
          <thead><tr>
            <th scope="col">{community?"게시글":"사용자"}</th>
            <th scope="col">{community?"작성자":"경기"}</th>
            {community?<th scope="col">게시판</th>:null}
            <th scope="col">{community?"작성일":"인증일"}</th>
            {!community?<th scope="col">결과</th>:null}
          </tr></thead>
          <tbody>{activity.data?.rows.map(row=>{
            const team=community?row.authorTeam:row.attendanceTeam;
            const author=<span className="activity-author" title={team?.name??"응원 구단 미선택"}>
              <TeamMark team={team??undefined}/>
              <span className={community?undefined:"attendance-user"}>{community?row.userName:<>
                <b title={row.userName}>{row.userName}</b><small>{row.teamName??"미선택"}</small>
              </>}</span>
            </span>;
            const entry=<>
              <button type="button" className="row-title" aria-haspopup="dialog"><b>{row.title}</b></button>
              {!community?<span className="attendance-venue" title={row.context}>{row.context}</span>:null}
            </>;
            return <tr key={row.id} className="activity-row" onClick={()=>setSelected(row)}>
              <th scope="row">{community?entry:author}</th>
              <td>{community?author:entry}</td>
              {community?<td>{row.context}</td>:null}
              <td><time dateTime={row.createdAt}>{dateLabel(row.createdAt,true)}</time></td>
              {!community?<td><span className="attendance-result" data-result={row.result??"UNKNOWN"}>{results[row.result??"UNKNOWN"]}</span></td>:null}
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!activity.data?.rows.length?<Empty message={query?"검색 결과가 없어요":community?"작성된 게시글이 없어요":"직관 인증 내역이 없어요"}/>:null}
      <NumberedPager page={page} total={activity.data?.total??0} onChange={setPage}/>
    </>}
    {selected&&community?<Dialog title="커뮤니티 게시글" dismissOnBackdrop onClose={()=>setSelected(null)}><article className="inbox-detail"><div className="member-history-meta"><span className="activity-author" title={selected.authorTeam?.name??"응원 구단 미선택"}><TeamMark team={selected.authorTeam??undefined}/><span>{selected.userName}</span></span><span>{selected.context}</span><time dateTime={selected.createdAt}>{dateLabel(selected.createdAt,true)}</time><Badge tone={selected.status==="VISIBLE"?"green":"neutral"}>{visibility[selected.status??""]??"미확인"}</Badge></div><h3>{selected.title}</h3><p>{selected.content||"본문이 없어요"}</p></article></Dialog>:selected?<AttendanceDetailDialog key={selected.id} attendanceId={selected.id} onClose={()=>setSelected(null)}/>:null}
  </section>;
}
