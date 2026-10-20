import {useCallback} from "react";
import {readInquiryAuthor} from "./data";
import {TeamMark} from "./TeamMark";
import {useResource} from "./useResource";
export function InquirySender({inquiryId}:{inquiryId:string}){
  const load=useCallback(()=>readInquiryAuthor(inquiryId),[inquiryId]);
  const sender=useResource(load);
  if(sender.loading)return <span className="inquiry-sender skeleton-line inquiry-sender-loading" role="status" aria-label="문의 작성자 불러오는 중"/>;
  if(sender.error)return <button type="button" className="quiet-button inquiry-sender" title={sender.error} onClick={sender.reload}>작성자 다시 불러오기</button>;
  return <span className="inquiry-sender" aria-label="문의 작성자" title={sender.data?.team?.name}>{sender.data?.team?<TeamMark team={sender.data.team}/>:null}<span className="inquiry-sender-name">{sender.data?.nickname??"닉네임 확인 불가"}</span></span>;
}
