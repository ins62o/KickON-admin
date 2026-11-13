import {useState} from 'react';
import {authClient} from '../auth/client';
import {SEASON} from './model';
import {applyOfficialMemberships,parseOfficialMemberships} from './official-memberships';
import {Dialog} from './WorkspaceUI';

export function OfficialMembershipDialog({teamName,onClose,onSaved}:{teamName:(id:string)=>string;onClose:()=>void;onSaved:(message:string)=>void}){
  const [input,setInput]=useState('');
  const [bundle,setBundle]=useState<ReturnType<typeof parseOfficialMemberships>|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const review=()=>{
    setError('');
    try{setBundle(parseOfficialMemberships(input,SEASON));}
    catch(cause){setError(cause instanceof Error?cause.message:'확인 자료를 다시 확인해 주세요');}
  };
  const openFile=async(file:File)=>{
    setError('');
    try{
      if(file.size>150_000)throw Error('선수단 확인 자료가 너무 커요');
      const content=await file.text();
      setInput(content);
      setBundle(parseOfficialMemberships(content,SEASON));
    }catch(cause){
      setError(cause instanceof Error?cause.message:'확인 자료를 읽지 못했어요');
    }
  };
  const save=async()=>{
    if(!bundle||!authClient||pending)return;
    setPending(true);
    setError('');
    try{
      const rows=await applyOfficialMemberships(authClient,bundle);
      const count=rows.filter(row=>row.status==='applied').length;
      onSaved(count? `${count}명의 현재 소속을 변경했어요`:'이미 반영된 소속이에요');
    }catch(cause){
      setError(cause instanceof Error?cause.message:'소속 변경을 저장하지 못했어요');
    }finally{setPending(false);}
  };
  return <Dialog title="공식 소속 변경" onClose={onClose} pending={pending} dismissOnBackdrop={false}>
    <div className="workspace-form">
      {bundle?<><p className="field-help">{bundle.reason}</p><div className="workspace-table-wrap">
        <table className="workspace-table"><thead><tr><th>선수</th><th>현재 소속</th><th>공식 소속</th><th>확인 자료</th></tr></thead>
          <tbody>{bundle.players.map(row=><tr key={row.player_id}><th scope="row">{row.name}</th><td>{teamName(row.from_team_id)}</td><td>{teamName(row.to_team_id)}</td><td><a href={row.sources.find(source=>source.kind==='player_profile')?.url} target="_blank" rel="noreferrer">K리그</a></td></tr>)}</tbody>
        </table></div></>:<>
        <label>공식 선수단 확인 자료<input type="file" accept=".json,application/json" onChange={event=>{const file=event.target.files?.[0];if(file)void openFile(file);}}/></label>
        <label>확인 자료 붙여넣기<textarea rows={4} maxLength={150_000} spellCheck={false} value={input} onChange={event=>setInput(event.target.value)}/></label>
      </>}
      {error?<p className="field-help" role="alert">{error}</p>:null}
      <div className="dialog-actions">
        {bundle?<><button type="button" className="secondary-button" disabled={pending} onClick={()=>{setBundle(null);setError('');}}>자료 수정</button>
          <button type="button" className="primary-button" disabled={pending} onClick={()=>void save()}>{pending?'반영 중':`${bundle.players.length}명 소속 반영`}</button></>:
          <button type="button" className="primary-button" disabled={!input.trim()} onClick={review}>변경 내용 확인</button>}
      </div>
    </div>
  </Dialog>;
}
