import {ActionButton} from "@seed-design/react";
import {useState,type FormEvent} from "react";
import type {InboxRow} from "./data";
import {dateLabel} from "./model";
import {Badge} from "./WorkspaceUI";
export function NoticeDetails({notice,writable,pending,onSubmit}:{notice:InboxRow;writable:boolean;pending:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){
  const [editing,setEditing]=useState(false);
  return <>
    <div className="inbox-detail"><Badge tone={notice.moderation_status==="VISIBLE"?"green":"neutral"}>{notice.moderation_status==="VISIBLE"?"게시 중":notice.moderation_status==="HIDDEN"?"숨김":"미확인"}</Badge> <span className="notice-detail-date">{dateLabel(notice.created_at,true)}</span>{!editing?<><h3>{notice.title}</h3><p>{notice.content}</p></>:null}</div>
    {writable?<form className="workspace-form" noValidate onSubmit={onSubmit}>
      {editing?<><input type="hidden" name="action" value="edit"/><label>제목<input name="title" defaultValue={notice.title} maxLength={100} disabled={pending}/></label><label>내용<textarea name="content" defaultValue={notice.content} rows={8} maxLength={10000} disabled={pending}/></label><div className="dialog-actions"><ActionButton variant="neutralWeak" size="small" type="button" disabled={pending} onClick={()=>setEditing(false)}>취소</ActionButton><ActionButton variant="brandSolid" size="small" disabled={pending} type="submit">{pending?"저장 중":"수정 저장"}</ActionButton></div></>:<div className="dialog-actions"><ActionButton variant="neutralWeak" size="small" type="button" disabled={pending} onClick={()=>setEditing(true)}>수정</ActionButton><ActionButton variant="brandSolid" size="small" disabled={pending} type="submit">{pending?"변경 중":notice.moderation_status==="HIDDEN"?"다시 게시":"공지 숨기기"}</ActionButton></div>}
    </form>:null}
  </>;
}
