import {useCallback,type ReactNode} from "react";
import {readAttendance} from "./data";
import {dateLabel,leagueLabel} from "./model";
import {TeamMark} from "./TeamMark";
import {useResource} from "./useResource";
import {Dialog,Empty,WorkspaceSkeleton} from "./WorkspaceUI";
const resultLabels={WIN:"승리",DRAW:"무승부",LOSS:"패배",PENDING:"집계 전",UNKNOWN:"미확인"};
const fixtureStatuses:Record<string,string>={SCHEDULED:"예정",NS:"예정",LIVE:"진행 중",INPLAY_1ST_HALF:"전반 진행 중",INPLAY_2ND_HALF:"후반 진행 중",HT:"하프타임",FINISHED:"종료",FT:"종료",POSTPONED:"연기",CANCELLED:"취소"};
const number=(value:number|null|undefined,digits=1)=>typeof value==="number"&&Number.isFinite(value)?value.toLocaleString("ko-KR",{maximumFractionDigits:digits,minimumFractionDigits:digits}):null;
function coordinates(latitude:number|null|undefined,longitude:number|null|undefined){
  const lat=number(latitude,6),lng=number(longitude,6);
  return lat!==null&&lng!==null?`${lat}, ${lng}`:"설정되지 않음";
}
function InfoSection({title,items}:{title:string;items:[string,ReactNode][]}){
  return <section className="attendance-info-section"><h3>{title}</h3><dl className="attendance-info-grid">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??"—"}</dd></div>)}</dl></section>;
}
export function AttendanceDetailDialog({attendanceId,onClose}:{attendanceId:string;onClose:()=>void}){
  const load=useCallback(()=>readAttendance(attendanceId),[attendanceId]);
  const detail=useResource(load),data=detail.data,fixture=data?.fixture;
  const distance=number(data?.distance),radius=number(fixture?.attendance_radius_meters,0);
  const score=fixture?.home_score!==null&&fixture?.home_score!==undefined&&fixture?.away_score!==null&&fixture?.away_score!==undefined?`${fixture.home_score} : ${fixture.away_score}`:"—";
  return <Dialog title="직관 인증 상세정보" className="attendance-detail-dialog" dismissOnBackdrop onClose={onClose}>
    {detail.loading?<WorkspaceSkeleton/>:detail.error?<Empty error={detail.error} retry={detail.reload}/>:data?<>
      <InfoSection title="인증 정보" items={[
        ["사용자",<span className="activity-author"><TeamMark team={data.team??undefined}/><span>{data.userName}</span></span>],
        ["사용자 ID",data.userId],["응원 구단",data.team?.name??"미선택"],
        ["인증 시간",dateLabel(data.verifiedAt,true)],["인증 방식",data.verificationType==="GPS"?"GPS 인증":data.verificationType==="MANUAL"?"수동 인증":"미확인"],
        ["직관 결과",<span className="attendance-result" data-result={data.result}>{resultLabels[data.result]}</span>],
        ["인증 좌표 (위도, 경도)",coordinates(data.coordinates.latitude,data.coordinates.longitude)],
        ["인증 지점과 기준 위치 사이 거리",distance===null?"—":`${distance}m`],["인증 ID",data.id],
      ]}/>
      <InfoSection title="경기 및 구장 정보" items={[
        ["경기",fixture?`${fixture.home_team_name} vs ${fixture.away_team_name}`:"경기 정보 없음"],
        ["경기 시작",dateLabel(fixture?.kickoff_at??null,true)],["경기 상태",fixtureStatuses[fixture?.status??""]??"미확인"],
        ["스코어",score],["구장",data.stadiumName],["구장 주소",data.stadiumAddress],
        ["경기 ID",data.fixtureId],["구장 ID",data.stadiumId],
        ["리그 · 라운드",fixture?`${leagueLabel(fixture.league_id)}${fixture.round!==null&&fixture.round!==undefined?` · ${fixture.round}라운드`:""}`:"—"],
        ["현재 인증 기준 좌표",coordinates(fixture?.attendance_latitude,fixture?.attendance_longitude)],
        ["현재 인증 반경",radius===null?"—":`${radius}m`],
      ]}/>
    </>:null}
  </Dialog>;
}
