import {useState,type FormEvent} from 'react';
import {CustomSelect} from '../components/CustomSelect';
import {mutate,type Fixture,type Stadium} from './data';
import {fixtureDateLabel,fixtureKickoffValue,fixtureScore,stadiumName,stadiumOptions} from './fixture-schedule';
import {FixtureStatusBadge} from './FixtureStatusBadge';
import {FixtureKickoffField} from './FixtureKickoffField';
import {leagueLabel,type Team} from './model';
import {TeamMark} from './TeamMark';
import {Info,SaveButton} from './TeamDetailUI';
import {Dialog,Feedback} from './WorkspaceUI';

export function FixtureDetailDialog({fixture,teams,stadiums,writable,stadiumsAvailable,onSaved,onClose}:{fixture:Fixture;teams:Team[];stadiums:Stadium[];writable:boolean;stadiumsAvailable:boolean;onSaved:()=>void;onClose:()=>void}){
 const [editing,setEditing]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[stadiumId,setStadiumId]=useState(fixture.stadium_id);
 const stadium=stadiums.find(item=>item.id===fixture.stadium_id);
 const score=fixtureScore(fixture);
 const team=(id:string,away=false)=>{const entry=teams.find(item=>item.id===id),mark=<TeamMark team={entry}/>;return <span className="fixture-team">{away?null:mark}<span>{entry?.name??id}</span>{away?mark:null}</span>;};
 const cancel=()=>{setEditing(false);setMessage('');};
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(pending||!writable||!stadiumsAvailable)return;setMessage('');const form=new FormData(event.currentTarget);
  try{
   const kickoff=fixtureKickoffValue(String(form.get('kickoff')??'')),selected=stadiums.find(item=>item.id===form.get('stadium'));
   if(!kickoff||!selected)throw Error('경기 시간과 경기장을 확인해 주세요');
   setPending(true);await mutate('admin_update_fixture_schedule',{p_fixture_id:fixture.id,p_kickoff_at:new Date(`${kickoff}+09:00`).toISOString(),p_stadium_id:selected.id,p_latitude:selected.id===fixture.stadium_id?(fixture.attendance_latitude??selected.latitude):selected.latitude,p_longitude:selected.id===fixture.stadium_id?(fixture.attendance_longitude??selected.longitude):selected.longitude,p_radius_meters:fixture.attendance_radius_meters??300,p_reason:'관리자 경기 일정 수정',p_league_id:fixture.league_id});onSaved();
  }catch(error){setMessage(error instanceof Error?error.message:'일정을 변경하지 못했어요');}finally{setPending(false);}
 };
 return <Dialog title="경기 일정 정보" className="fixture-detail-dialog" pending={pending} onClose={onClose}>
  <div className="fixture-matchup">{team(fixture.home_team_id)}<strong className={score===null?'fixture-matchup-versus':'fixture-matchup-score'}>{score??'VS'}</strong>{team(fixture.away_team_id,true)}</div>
  {editing?<form className="workspace-form" noValidate onSubmit={event=>void save(event)}>
   <FixtureKickoffField value={fixture.kickoff_at} disabled={pending}/>
   <div className="workspace-form-field"><span>경기장</span><input type="hidden" name="stadium" value={stadiumId}/><CustomSelect label="경기장" value={stadiumId} onChange={setStadiumId} disabled={pending} placement="top-end" options={stadiumOptions(stadiums,fixture.stadium_id)}/></div>
   <div className="dialog-actions"><button type="button" className="secondary-button" disabled={pending} onClick={cancel}>취소</button><SaveButton pending={pending}/></div>
  </form>:<>
   <Info items={[
    ['리그',leagueLabel(fixture.league_id)],['라운드',fixture.round==null?null:`${fixture.round}라운드`],['경기 시간',fixtureDateLabel(fixture.kickoff_at)],['상태',<FixtureStatusBadge status={fixture.status}/>],['경기장',stadium?stadiumName(stadium):stadiumsAvailable?'미정':'경기장 확인 필요'],
   ]}/>
   {writable?<div className="dialog-actions"><button type="button" className="primary-button" disabled={!stadiumsAvailable} onClick={()=>{setStadiumId(fixture.stadium_id);setMessage('');setEditing(true);}}>일정 수정</button></div>:null}
  </>}
  <Feedback message={message}/>
 </Dialog>;
}
