import {useState} from "react";
import {createPortal} from "react-dom";
import {authEnvironment,authSettings,changeEnvironment} from "../auth/client";
import {CustomSelect} from "./CustomSelect";
import {Toast} from "./Toast";
export function EnvironmentSelect({disabled=false}: {disabled?:boolean}) {
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  const select=async(value:string)=>{setError("");setPending(true);try{await changeEnvironment(value);}catch(cause){setError(cause instanceof Error?cause.message:"환경을 변경하지 못했어요");}finally{setPending(false);}};
  return <><CustomSelect label="현재 환경" value={authEnvironment} disabled={disabled||pending} onChange={value=>void select(value)} options={[{value:"development",label:"개발",disabled:!authSettings.environments.development},{value:"production",label:"운영",disabled:!authSettings.environments.production}]}/>{error?createPortal(<Toast key={error} message={error}/>,document.body):null}</>;
}
