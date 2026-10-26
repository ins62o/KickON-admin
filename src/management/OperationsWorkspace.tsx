import {ActionButton} from "@seed-design/react";
import type {OperationTab} from "../dashboard/navigation";
import {ActivityWorkspace} from "./ActivityWorkspace";
import {useResource} from "./useResource";
import {useCallback,useState,type FormEvent} from "react";
import type {AdminIdentity} from "../auth/policy";
import {CustomSelect} from "../components/CustomSelect";
import {readCatalogue,readInbox,readOperationCounts,mutate,updateNotice,changeNoticeVisibility,type InboxKind,type InboxRow} from "./data";
import {dateLabel,leagueLabel,teamLeague,type Team,type Standing} from "./model";
import {TeamMark} from "./TeamMark";
import {canWrite} from "./permissions";
import {Badge,Dialog,Empty,Feedback,Pager,Refresh,SearchField,Stat,WorkspaceSkeleton,WorkspaceTabs} from "./WorkspaceUI";
import {InquirySender} from "./InquirySender";
import {ReportDetails} from "./ReportDetails";
import {reportReasons as reasons,reportTargets,reportStatuses} from "./report-detail";
import {NoticeDetails} from "./NoticeDetails";
import {MarketingStudio} from "./MarketingStudio";
import {AppReleaseManager} from './AppReleaseManager';
const statusNames:Record<string,string>={VISIBLE:"게시 중",HIDDEN:"숨김",RECEIVED:"접수",IN_PROGRESS:"처리 중",ANSWERED:"답변 완료",CLOSED:"종료",...reportStatuses};
const categories:Record<string,string>={APP_ERROR:"앱 오류",DATA_ERROR:"데이터 오류",ACCOUNT:"계정",NOTIFICATION:"알림",ATTENDANCE:"직관",COMMUNITY:"커뮤니티",SUGGESTION:"서비스 제안",OTHER:"기타"};
const filters={notices:["VISIBLE","HIDDEN"],inquiries:["RECEIVED","ANSWERED"],reports:Object.keys(reportStatuses)};
function NoticeForm({teams,standings,pending,onSubmit}:{teams:Team[];standings:Standing[];pending:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){
  const [board,setBoard]=useState("LEAGUE"),[teamId,setTeamId]=useState("");
  const teamOptions=[{value:"",label:"선택 안 함"},...["kleague","kleague2",null].flatMap(id=>teams.filter(team=>teamLeague(standings,team.id)===id).sort((a,b)=>a.name.localeCompare(b.name,"ko")).map(team=>({value:team.id,label:team.name,group:leagueLabel(id),icon:<TeamMark team={team}/>})))];
  return <form className="workspace-form notice-form" noValidate onSubmit={onSubmit}>
    <div className="workspace-form-field"><span>노출 범위</span><input type="hidden" name="board" value={board}/><CustomSelect label="노출 범위" value={board} onChange={value=>{setBoard(value);if(value==="LEAGUE")setTeamId("");}} disabled={pending} options={[{value:"LEAGUE",label:"자유 게시판"},{value:"TEAM",label:"구단 게시판"}]}/></div>
    <div className="workspace-form-field"><span>대상 구단</span><input type="hidden" name="teamId" value={teamId}/><CustomSelect label="대상 구단" value={teamId} onChange={value=>{setTeamId(value);setBoard(value?"TEAM":"LEAGUE");}} disabled={pending} options={teamOptions}/></div>
    <label>제목<input name="title" maxLength={100} disabled={pending}/></label>
    <label>내용<textarea name="content" rows={8} maxLength={10000} disabled={pending}/></label>
    <div className="dialog-actions"><ActionButton variant="brandSolid" size="small" disabled={pending} type="submit">{pending?"등록 중":"공지 등록"}</ActionButton></div>
  </form>;
}
function InquiryReplyForm({inquiry,pending,onSubmit}:{inquiry:InboxRow;pending:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){
  const [status,setStatus]=useState(inquiry.status??"ANSWERED");
  return <form className="workspace-form inquiry-form" noValidate onSubmit={onSubmit}>
    <div className="workspace-form-field"><span>처리 상태</span><input type="hidden" name="status" value={status}/><CustomSelect label="처리 상태" value={status} onChange={setStatus} disabled={pending} options={filters.inquiries.map(value=>({value,label:statusNames[value]}))}/></div>
    <label>답변<textarea name="answer" defaultValue={inquiry.answer_content??""} maxLength={4000} rows={6} disabled={pending}/></label>
    <div className="dialog-actions"><ActionButton variant="brandSolid" size="small" disabled={pending} type="submit">{pending?"저장 중":"저장"}</ActionButton></div>
  </form>;
}
export function OperationsWorkspace({admin,tab,onTabChange}:{admin:AdminIdentity;tab:OperationTab;onTabChange:(tab:OperationTab)=>void}){
  const [status,setStatus]=useState("all"),[query,setQuery]=useState(""),[page,setPage]=useState(1),[selected,setSelected]=useState<InboxRow|null>(null),[compose,setCompose]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState("");
  const [previousTab,setPreviousTab]=useState(tab);
  // Browser history also changes tabs without going through changeTab.
  if(previousTab!==tab){setPreviousTab(tab);setStatus("all");setQuery("");setPage(1);setSelected(null);setCompose(false);setMessage("");}
  const counts=useResource(readOperationCounts),catalogue=useResource(readCatalogue);
  const kind=(tab==="notices"||tab==="reports"?tab:"inquiries") as InboxKind;
  const loader=useCallback(()=>tab==="notices"||tab==="inquiries"||tab==="reports"?readInbox(kind,status,page,query):Promise.resolve({rows:[] as InboxRow[],total:0}),[tab,kind,status,page,query]);
  const inbox=useResource(loader);
  const writable=canWrite(admin.role,kind==="inquiries"?"support":"moderation");
  const changeTab=(value:string)=>{onTabChange(value as OperationTab);setStatus("all");setPage(1);setQuery("");setSelected(null);};
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);setMessage("");
    const text=(name:string)=>String(form.get(name)??"").trim();
    try{
      if(!writable)throw new Error("변경할 권한이 없어요");
      setPending(true);
      if(compose){
        if(text("title").length<2||text("content").length<5)throw new Error("제목은 2자 이상, 내용은 5자 이상 입력해 주세요");
        if(text("board")==="TEAM"&&!text("teamId"))throw new Error("대상 구단을 선택해 주세요");
        await mutate("admin_create_community_notice",{target_board:text("board"),target_team_id:text("board")==="TEAM"?text("teamId"):"",notice_title:text("title"),notice_content:text("content")});
        setCompose(false);setMessage("공지사항을 등록했어요");
      }else if(selected&&kind==="inquiries"){
        if(text("status")==="ANSWERED"&&!text("answer"))throw new Error("답변 내용을 입력해 주세요");
        await mutate("admin_update_support_inquiry",{p_inquiry_id:selected.id,p_status:text("status"),p_answer_content:text("answer")||null,p_internal_note:null,p_reason:"관리자 문의 답변 저장"});setSelected(null);setMessage("문의 답변을 저장했어요");
      }else if(selected&&kind==="reports"){
        if(text("note").length<3)throw new Error("처리 사유를 3자 이상 입력해 주세요");
        await mutate("admin_update_content_report",{p_report_id:selected.id,p_status:text("status"),p_resolution_note:text("note"),p_reason:text("note")});setSelected(null);setMessage("신고 처리 상태를 저장했어요");
      }else if(selected&&kind==="notices"){
        if(text("action")==="edit"){
          await updateNotice(selected,text("title"),text("content"));setMessage("공지를 수정했어요");
        }else{
          await changeNoticeVisibility(selected.id,selected.moderation_status!=="HIDDEN");setMessage("공지 게시 상태를 변경했어요");
        }
        setSelected(null);
      }
      inbox.reload();counts.reload();
    }catch(error){setMessage(error instanceof Error?error.message:"변경하지 못했어요");}finally{setPending(false);}
  };
  return <div className="management-workspace"><div className="workspace-stats three"><Stat label="게시 중인 공지" value={counts.data?.[0]??null} unit="건" onClick={()=>changeTab("notices")}/><Stat label="답변 대기 문의" value={counts.data?.[1]??null} unit="건" onClick={()=>changeTab("inquiries")}/><Stat label="확인할 신고" value={counts.data?.[2]??null} unit="건" onClick={()=>changeTab("reports")}/></div>
    <WorkspaceTabs mobileSelect value={tab} onChange={changeTab} items={[{value:"community",label:"커뮤니티"},{value:"attendances",label:"직관 인증"},{value:"marketing",label:"마케팅 관리"},{value:"notices",label:"공지사항"},{value:"inquiries",label:"1:1 문의"},{value:"reports",label:"신고 접수"},{value:"app-updates",label:"앱 업데이트"}]}>
    {tab==="community"||tab==="attendances"?<ActivityWorkspace key={tab} kind={tab}/>:tab==="marketing"?<MarketingStudio/>:tab==='app-updates'?<AppReleaseManager admin={admin}/>:<section className="workspace-panel"><div className="workspace-toolbar"><h2>{kind==="notices"?"공지사항":kind==="inquiries"?"문의 접수 내역":"신고 접수 내역"}</h2><div className="workspace-tools"><SearchField value={query} onChange={value=>{setQuery(value);setPage(1);}} placeholder={kind==="reports"?"신고 내용 검색":"제목 검색"}/><CustomSelect label="처리 상태" value={status} onChange={value=>{setStatus(value);setPage(1);}} options={[{value:"all",label:"전체 상태"},...filters[kind].map(value=>({value,label:statusNames[value]}))]}/></div><div className="workspace-actions"><Refresh onClick={inbox.reload} disabled={inbox.loading}/>{kind==="notices"&&writable?<ActionButton variant="brandSolid" size="small" type="button" onClick={()=>setCompose(true)}>공지 작성</ActionButton>:null}</div></div>
    {inbox.loading?<WorkspaceSkeleton/>:inbox.error?<Empty error={inbox.error} retry={inbox.reload}/>:<><div className="workspace-table-wrap"><table className={`workspace-table inbox-table${kind==="notices"?" notice-table":""}`}><thead><tr><th>{kind==="reports"?"신고 사유":"제목"}</th><th>{kind==="notices"?"노출 범위":kind==="inquiries"?"유형":"대상"}</th><th>접수일</th><th>상태</th></tr></thead><tbody>{inbox.data?.rows.map(row=><tr key={row.id} className="inbox-row" onClick={()=>setSelected(row)}><th scope="row"><button type="button" className="row-title" aria-haspopup="dialog"><b>{row.title||row.subject||reasons[row.reason??""]||row.reason||"기타 신고"}</b></button></th><td>{kind==="notices"?(row.board==="TEAM"?(catalogue.data?.teams.find(t=>t.id===row.team_id)?.name??"구단 게시판"):"자유 게시판"):kind==="inquiries"?(categories[row.category??""]??row.category):(reportTargets[row.target_type??""]??"미확인")}</td><td>{dateLabel(row.created_at).replace(/\.$/,"")}</td><td><Badge tone={["RECEIVED","OPEN"].includes(row.status??"")?"orange":["ANSWERED","RESOLVED","VISIBLE"].includes(row.status??row.moderation_status??"")?"green":"neutral"}>{statusNames[row.status??row.moderation_status??""]??"미확인"}</Badge></td></tr>)}</tbody></table></div>{!inbox.data?.rows.length?<Empty message="조건에 맞는 접수 내역이 없어요"/>:null}<Pager page={page} total={inbox.data?.total??0} onChange={setPage}/></>}
    </section>}
    </WorkspaceTabs>
    {compose?<Dialog title="공지사항 작성" pending={pending} onClose={()=>setCompose(false)}><NoticeForm teams={catalogue.data?.teams??[]} standings={catalogue.data?.standings??[]} pending={pending} onSubmit={submit}/></Dialog>:null}
    {selected?<Dialog title={kind==="inquiries"?"문의 답변":kind==="reports"?"신고 처리":"공지사항"} pending={pending} onClose={()=>setSelected(null)}>{kind==="notices"?<NoticeDetails key={selected.id} notice={selected} writable={writable} pending={pending} onSubmit={submit}/>:kind==="reports"?<ReportDetails key={selected.id} reportId={selected.id} teams={catalogue.data?.teams??[]} writable={writable} pending={pending} onSubmit={submit}/>:<><div className="inbox-detail"><div className="inquiry-detail-meta"><Badge>{dateLabel(selected.created_at,true)}</Badge><InquirySender key={selected.id} inquiryId={selected.id}/></div><h3>{selected.title||selected.subject||reasons[selected.reason??""]||"신고 내용"}</h3><p>{selected.content||selected.details||"추가 내용 없음"}</p></div>
    {writable?<InquiryReplyForm key={selected.id} inquiry={selected} pending={pending} onSubmit={submit}/>:selected.answer_content?<div className="read-answer"><h3>답변</h3><p>{selected.answer_content}</p></div>:null}</>}</Dialog>:null}
    <Feedback message={message}/>
  </div>;
}
