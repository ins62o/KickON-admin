import {ActionButton} from "@seed-design/react";
import {useCallback,useState,type FormEvent} from "react";
import {CustomSelect} from "../components/CustomSelect";
import {readReport} from "./data";
import {dateLabel,type Team} from "./model";
import {TeamMark} from "./TeamMark";
import {reportReasons,reportTargets,reportStatuses,type ReportDetail} from "./report-detail";
import {useResource} from "./useResource";
import {Badge,Empty,WorkspaceSkeleton} from "./WorkspaceUI";
type Actions={writable:boolean;pending:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void};
function ReportContent({report,teams,writable,pending,onSubmit}:{report:ReportDetail;teams:Team[]}&Actions){
  const [status,setStatus]=useState<string>(report.status);
  const reporterTeam=teams.find(team=>team.id===report.reporterTeamId),reportedTeam=teams.find(team=>team.id===report.reportedTeamId);
  return <>
    <div className="inbox-detail"><Badge>{dateLabel(report.createdAt,true)}</Badge>
      <dl className="workspace-details report-details">
        <div><dt>신고 유형</dt><dd>{reportReasons[report.reason??""]??"미확인"}</dd></div>
        <div><dt>콘텐츠 유형</dt><dd>{reportTargets[report.targetType??""]??"미확인"}</dd></div>
        <div><dt>신고한 사용자</dt><dd><span className="activity-author report-participant" title={reporterTeam?.name}>{reporterTeam?<TeamMark team={reporterTeam}/>:null}<span>{report.reporterNickname??"확인할 수 없음"}</span></span></dd></div>
        <div><dt>신고받은 사용자</dt><dd><span className="activity-author report-participant" title={reportedTeam?.name}>{reportedTeam?<TeamMark team={reportedTeam}/>:null}<span>{report.reportedNickname??"확인할 수 없음"}</span></span></dd></div>
      </dl>{report.details?<p>{report.details}</p>:null}
    </div>
    {writable?<form className="workspace-form report-form" noValidate onSubmit={onSubmit}>
      <div className="workspace-form-field"><span>처리 상태</span><input type="hidden" name="status" value={status}/><CustomSelect label="처리 상태" value={status} onChange={setStatus} disabled={pending} options={Object.entries(reportStatuses).map(([value,label])=>({value,label}))}/></div>
      <label>처리 사유<textarea name="note" defaultValue={report.resolutionNote??""} maxLength={2000} rows={4} disabled={pending}/></label>
      <div className="dialog-actions"><ActionButton variant="brandSolid" size="small" disabled={pending} type="submit">{pending?"저장 중":"저장"}</ActionButton></div>
    </form>:<Badge tone={report.status==="RESOLVED"?"green":"neutral"}>{reportStatuses[report.status]}</Badge>}
  </>;
}
export function ReportDetails({reportId,teams,...actions}:{reportId:string;teams:Team[]}&Actions){
  const load=useCallback(()=>readReport(reportId),[reportId]);
  const report=useResource(load);
  if(report.loading)return <WorkspaceSkeleton/>;
  if(report.error||!report.data)return <Empty error={report.error||"신고 정보를 찾을 수 없어요"} retry={report.reload}/>;
  return <ReportContent key={report.data.id} report={report.data} teams={teams} {...actions}/>;
}
