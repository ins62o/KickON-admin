import {adminApiUrl} from '../auth/api.ts';
import {useState} from 'react';
import {LoaderCircle,Power} from 'lucide-react';
import {authClient,authEnvironment} from '../auth/client';
import type {RestartCapability} from './system-health';
import {Dialog} from './WorkspaceUI';

export function DatabaseRestartControl({capability,now,onRequested,onMessage:setMessage}:{capability?:RestartCapability;now:number;onRequested:()=>void;onMessage:(message:string)=>void}){
 const [requestId,setRequestId]=useState<string|null>(null),[pending,setPending]=useState(false),[localCooldown,setLocalCooldown]=useState<string|null>(null);
 const until=Math.max(Date.parse(capability?.cooldownUntil??'')||0,Date.parse(localCooldown??'')||0),cooling=until>now;
 const environmentLabel=authEnvironment==='production'?'운영':'개발';
 const submit=async()=>{
  if(pending||!requestId||!capability?.configured||cooling)return;
  setPending(true);setMessage('');
  try{
   const session=await authClient!.auth.getSession(),token=session.data.session?.access_token;
   if(session.error||!token)throw Error('로그인 상태를 다시 확인해 주세요');
   const response=await fetch(adminApiUrl('project-restart'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({environment:authEnvironment,projectRef:capability.projectRef,requestId,confirmed:true}),signal:AbortSignal.timeout(30000)});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'재시작 요청을 보내지 못했어요');
   if(!['pending','accepted','unknown','failed'].includes(body.status)||typeof body.message!=='string')throw Error('재시작 요청의 처리 결과를 확인할 수 없어요');
   setMessage(body.message);setLocalCooldown(body.cooldownUntil??null);setRequestId(null);onRequested();
  }catch(error){setMessage(error instanceof Error&&error.name==='Error'?error.message:'전송 결과를 확인할 수 없어요 모니터링 상태를 먼저 확인해 주세요');}
  finally{setPending(false);}
 };
 if(!capability?.allowed)return null;
 return <>
  <button type="button" className="admin-icon-button system-restart-button" aria-label="DB 서버 재시작" aria-haspopup="dialog" aria-expanded={Boolean(requestId)} disabled={pending||cooling} title={cooling?'최근 재시작 요청 후 5분이 지나면 다시 요청할 수 있어요':'DB 서버 재시작'} onClick={()=>{setMessage('');setRequestId(crypto.randomUUID());}}><Power size={20} aria-hidden="true"/></button>
  {requestId?<Dialog title="DB 서버를 재시작할까요?" pending={pending} onClose={()=>setRequestId(null)} className="database-restart-dialog">
   <div className="database-restart-content"><strong>{environmentLabel} Supabase DB 서버</strong><p>재시작 중에는 앱의 데이터 조회와 저장이 잠시 중단될 수 있어요</p></div>
   {!capability.configured?<div className="database-restart-setup"><p>재시작 연결 설정이 필요해요</p><a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer">Supabase 토큰 설정</a></div>:null}
   <div className="dialog-actions"><button type="button" className="secondary-button" disabled={pending} onClick={()=>setRequestId(null)}>취소</button><button type="button" className="primary-button" disabled={pending||!capability.configured||cooling} onClick={()=>void submit()}>{pending?<><LoaderCircle size={18} className="system-restart-spinner" aria-hidden="true"/><span className="visually-hidden">재시작 요청 중</span></>:`${environmentLabel} DB 재시작`}</button></div>
  </Dialog>:null}
 </>;
}
