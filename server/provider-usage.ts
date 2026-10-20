export type ProviderObservation = {observed_at:string;requested_entity:'Fixture';remaining:number;resets_in_seconds:number};

const integer=(value:unknown)=>{
  if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))return null;
  const number=Number(value);
  return Number.isSafeInteger(number)&&number>=0?number:null;
};

export function createProviderUsageReader(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
  const cache=new Map<string,{observation:ProviderObservation;until:number}>();
  const pending=new Map<string,Promise<ProviderObservation>>();
  return async(token:string):Promise<ProviderObservation>=>{
    if(!token)throw Error('스포츠 API 사용량 조회 설정이 필요해요');
    const cached=cache.get(token);
    if(cached&&cached.until>now())return cached.observation;
    const existing=pending.get(token);
    if(existing)return existing;
    const request=(async()=>{
      try{
        const observedAt=now();
        const response=await fetcher('https://api.sportmonks.com/v3/football/fixtures?select=id&per_page=1',{
          headers:{Authorization:token,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error',
        });
        if(!response.ok&&response.status!==429)throw Error();
        const payload=await response.json();
        const limit=payload?.rate_limit;
        const remaining=integer(limit?.remaining),resets=integer(limit?.resets_in_seconds);
        if(limit?.requested_entity!=='Fixture'||remaining===null||resets===null||resets<=0)throw Error();
        const observation:ProviderObservation={observed_at:new Date(observedAt).toISOString(),requested_entity:'Fixture',remaining,resets_in_seconds:resets};
        cache.set(token,{observation,until:observedAt+Math.min(60000,resets*1000)});
        return observation;
      }catch{
        throw Error('스포츠 API 사용량을 확인하지 못했어요');
      }
    })();
    pending.set(token,request);
    try{return await request;}finally{pending.delete(token);}
  };
}
