import {useEffect,useState} from 'react';
import {readSyncHealth} from './data';
import type {SyncHealth} from './sync-health';

export function useSyncHealth(active:boolean){
 const [data,setData]=useState<SyncHealth|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!active)return;
  let disposed=false,pending=false;
  const load=async()=>{
   if(pending||document.hidden)return;pending=true;
   try{const next=await readSyncHealth();if(!disposed){setData(next);setError('');}}
   catch{if(!disposed)setError('동기화 상태를 확인할 수 없어요');}
   finally{pending=false;}
  };
  void load();const timer=setInterval(()=>void load(),15000);
  const visible=()=>{if(!document.hidden)void load();};document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[active,revision]);
 return {data,error,reload:()=>setRevision(value=>value+1)};
}
