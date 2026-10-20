export function createOperationGuard(readMarker:()=>string){
  let generation=0;
  return {invalidate:()=>{generation++;},begin:()=>{const version=generation,marker=readMarker();return()=>generation===version&&marker===readMarker();}};
}
export async function finishEnvironmentSwitch({isCurrent,store,discard,navigate}:{isCurrent:()=>boolean;store:()=>Promise<void>;discard:()=>Promise<void>;navigate:()=>void}){
  if(!isCurrent()){await discard();return;}
  try {await store();} catch(error){await discard();throw error;}
  if(!isCurrent()){await discard();return;}
  navigate();
}
