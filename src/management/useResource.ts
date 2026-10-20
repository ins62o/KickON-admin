import {useEffect,useState} from "react";
export function useResource<T>(load:()=>Promise<T>,keepPreviousData=false){
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{load:(()=>Promise<T>)|null;revision:number;data:T|null;error:string}>({load:null,revision:-1,data:null,error:""});
  useEffect(()=>{let disposed=false;void load().then(data=>{if(!disposed)setState({load,revision,data,error:""});}).catch(error=>{if(!disposed)setState({load,revision,data:null,error:error instanceof Error?error.message:"정보를 불러오지 못했어요"});});return()=>{disposed=true;};},[load,revision]);
  const loading=state.load!==load||state.revision!==revision;
  return {data:loading&&!keepPreviousData?null:state.data,error:loading?"":state.error,loading,reload:()=>setRevision(value=>value+1)};
}
