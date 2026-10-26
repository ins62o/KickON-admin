export function providerResult(value:unknown){
  if(!value||typeof value!=="object")throw new Error("동기화 응답을 확인할 수 없어요");
  const row=value as Record<string,unknown>,status=row.status;
  if(row.error)throw new Error("동기화 서버가 요청을 완료하지 못했어요");
  const details={providerStatus:status,quarantines:row.quarantines??[],reconciliation:row.reconciliation??null,telemetry:row.telemetry??null};
  if(status==="pending")return {status:"partial",message:"라인업이 아직 준비되지 않았어요 다음 실행에서 다시 확인해 주세요",details};
  if(status==="completed_with_quarantine"||status==="partial")return {status:"partial",message:"일부 데이터를 보류했어요 동기화 결과를 확인해 주세요",details};
  if(status==="cached")return {status:"succeeded",message:"이번 요청은 새 작업 없이 종료됐어요",details};
  if(status==="skipped")return {status:"cancelled",message:"이번 동기화는 실행할 작업이 없어 건너뛰었어요",details};
  if(status==="synced"||status==="completed"||status==="succeeded")return {status:"succeeded",message:"동기화를 완료했어요",details};
  throw new Error("동기화 완료 상태를 확인할 수 없어요 실행 내역을 확인해 주세요");
}
