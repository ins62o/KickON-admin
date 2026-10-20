import {useState,type FormEvent} from 'react';
import {CustomSelect} from '../components/CustomSelect';
import {BirthDateField} from './BirthDateField';
import {saveTeamPlayer} from './data';
import {dateLabel} from './model';
import {needsKoreanName,playerName,positionLabel,playerPositionOptions,type TeamPlayer} from './team-detail';
import {Info,SaveButton,PlayerPhoto} from './TeamDetailUI';
import {Badge,Dialog,Feedback} from './WorkspaceUI';

export function PlayerDetailDialog({player:initialPlayer,teamName,writable,onSaved,onClose}:{player:TeamPlayer;teamName:string;writable:boolean;onSaved:()=>void;onClose:()=>void}){
 const [player,setPlayer]=useState(initialPlayer),[editing,setEditing]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const [position,setPosition]=useState(initialPlayer.position??'');
 const reset=()=>{setEditing(false);setMessage('');};
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(pending||!writable)return;const form=new FormData(event.currentTarget);setMessage('');setPending(true);
  try{setPlayer(await saveTeamPlayer(player,form));onSaved();setEditing(false);setMessage('수정 내용을 저장했어요');}
  catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했어요');}finally{setPending(false);}
 };
 return <Dialog title="선수 정보" className="player-detail-dialog" pending={pending} onClose={onClose}>

   {needsKoreanName(player)?<Badge tone="orange">한글 이름 미등록</Badge>:null}<div className="club-player-profile"><PlayerPhoto player={player}/><div><div className="club-player-name-row"><h3>{playerName(player)}</h3>{writable&&!editing?<button type="button" className="primary-button" onClick={()=>{setPosition(player.position??'');setEditing(true);}}>선수 정보 수정</button>:null}</div>{playerName(player)!==player.player_name?<p>{player.player_name}</p>:null}<span>{teamName} · {positionLabel(player.position)}{player.shirt_number!==null?` · ${player.shirt_number}번`:''}</span></div></div>
   {editing?<form className="workspace-form club-edit-form" noValidate onSubmit={event=>void save(event)}>
    <div className="club-edit-grid"><label>선수 이름<input name="player_name" defaultValue={player.player_name} maxLength={160} disabled={pending}/></label><label>한글 이름<input name="display_name_ko" defaultValue={player.display_name_ko??''} maxLength={160} disabled={pending}/></label><label>등번호<input name="shirt_number" type="number" min={0} max={999} defaultValue={player.shirt_number??''} disabled={pending}/></label><div className="workspace-form-field"><span>포지션</span><input type="hidden" name="position" value={position}/><CustomSelect label="포지션" value={position} onChange={setPosition} options={playerPositionOptions(player.position)} disabled={pending}/></div><label>세부 포지션<input name="detailed_position" defaultValue={player.detailed_position??''} maxLength={160} disabled={pending}/></label><BirthDateField value={player.date_of_birth} disabled={pending}/>{([['height','키 (cm)',player.height,50,300],['weight','몸무게 (kg)',player.weight,20,300],['appearances','출전',player.appearances,0,9999],['goals','득점',player.goals,0,9999],['assists','도움',player.assists,0,9999]] as const).map(([name,label,entry,min,max])=><label key={name}>{label}<input name={name} type="number" min={min} max={max} defaultValue={entry??''} disabled={pending}/></label>)}</div>
    <div className="dialog-actions"><button type="button" className="secondary-button" disabled={pending} onClick={reset}>취소</button><SaveButton pending={pending}/></div>
   </form>:<Info items={[
    ['선수 이름',player.player_name],['한글 이름',player.display_name_ko],['등번호',player.shirt_number],['포지션',positionLabel(player.position)],['세부 포지션',player.detailed_position],['생년월일',dateLabel(player.date_of_birth).replace(/\.$/,'')],['키',player.height===null?null:`${player.height}cm`],['몸무게',player.weight===null?null:`${player.weight}kg`],['출전',player.appearances],['득점',player.goals],['도움',player.assists],['선수단 등록',player.in_squad?'등록':'제외'],['선수 ID',player.player_id],['정보 갱신',dateLabel(player.updated_at,true)],
   ]}/>}

 <Feedback message={message}/>
 </Dialog>;
}
