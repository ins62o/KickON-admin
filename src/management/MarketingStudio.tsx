import {ActionButton} from "@seed-design/react";
import {useEffect,useRef,useState} from "react";
import {CalendarDays,Check,Copy,Download,FileText,Gift,Plus,Save,Trash2,X} from "lucide-react";
import {authEnvironment} from "../auth/client";
import {CustomSelect} from "../components/CustomSelect";
import {Dialog,Empty,Feedback,SearchField} from "./WorkspaceUI";
import {marketingKinds,marketingPlaceholders,newDraft,parseDrafts,saveDraft,validateDraft,type MarketingDraft,type MarketingKind} from "./marketing-drafts";
import {paintMarketingImage} from "./marketing-image";
import {MatchdayEditor} from "./MatchdayEditor";
import {matchdayFooter} from "./marketing-matchday";
import "./marketing.css";
const storageKey=`kickon-marketing-drafts-${authEnvironment}`;
const icons={update:FileText,event:Gift,notice:CalendarDays};
function loadDrafts(){
  try{
    const raw=localStorage.getItem(storageKey)??"[]",data:unknown=JSON.parse(raw),drafts=parseDrafts(raw);
    if(!Array.isArray(data)||data.length!==drafts.length)throw new Error();
    return {drafts,error:""};
  }catch{return {drafts:[] as MarketingDraft[],error:"저장한 초안을 읽지 못했어요 원본 보호를 위해 저장을 멈췄어요 브라우저 저장 공간을 확인해 주세요"};}
}
export function MarketingStudio(){
  const [initial]=useState(loadDrafts),[drafts,setDrafts]=useState(initial.drafts);
  const [today]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
  const [kind,setKind]=useState<MarketingKind>("update"),[editors,setEditors]=useState<Record<MarketingKind,MarketingDraft>>(()=>({update:newDraft("update",today),event:newDraft("event",today),notice:newDraft("notice",today)}));
  const [message,setMessage]=useState(initial.error),[query,setQuery]=useState(""),[exporting,setExporting]=useState(false),[overflow,setOverflow]=useState(false);
  const [previewWidth,setPreviewWidth]=useState(0),[imageType,setImageType]=useState<"png"|"jpg">("png");
  const [toDelete,setToDelete]=useState<MarketingDraft|null>(null),[toOpen,setToOpen]=useState<MarketingDraft|null>(null);
  const previewOverflow=useRef(false);
  const canvas=useRef<HTMLCanvasElement>(null),draft=editors[kind],category=marketingKinds.find(item=>item.value===kind)!;
  const saved=drafts.find(item=>item.id===draft.id);
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved??newDraft(kind,today));
  const visible=drafts.filter(item=>item.kind===kind&&`${item.title} ${item.body} ${item.memo} ${item.features.map(feature=>feature.title).join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useEffect(()=>{
    const target=canvas.current;if(!target)return;
    const measure=()=>setPreviewWidth(Math.max(1,Math.round(target.getBoundingClientRect().width*window.devicePixelRatio)));
    const observer=new ResizeObserver(measure);observer.observe(target);measure();
    window.addEventListener("resize",measure);
    return()=>{observer.disconnect();window.removeEventListener("resize",measure);};
  },[]);
  useEffect(()=>{
    if(!previewWidth)return;
    let cancelled=false;const buffer=document.createElement("canvas");
    void paintMarketingImage(buffer,draft,previewWidth).then(result=>{
      if(cancelled||!canvas.current)return;
      const target=canvas.current;target.width=buffer.width;target.height=buffer.height;target.getContext("2d")?.drawImage(buffer,0,0);setOverflow(result.overflow);
      if(result.overflow&&!previewOverflow.current)setMessage(draft.matchday?'경기가 이미지 영역을 넘어요 경기 수를 줄이거나 스토리 규격을 선택해 주세요':'내용이 이미지 영역을 넘어요 본문을 줄이거나 스토리 규격을 선택해 주세요');
      previewOverflow.current=result.overflow;
    }).catch(error=>{if(!cancelled){canvas.current?.getContext('2d')?.clearRect(0,0,canvas.current.width,canvas.current.height);setMessage(error instanceof Error?error.message:'미리보기를 그리지 못했어요 이미지 내보내기를 다시 시도해 주세요');}});
    return()=>{cancelled=true;};
  },[draft,previewWidth]);
  const edit=(changes:Partial<MarketingDraft>)=>setEditors(current=>({...current,[kind]:{...current[kind],...changes}}));
  const field=(key:"title"|"body"|"memo"|"date"|"eventEnd",value:string)=>edit({[key]:value});
  const open=(next:MarketingDraft)=>{setKind(next.kind);setEditors(current=>({...current,[next.kind]:next}));setToOpen(null);};
  const requestOpen=(next:MarketingDraft)=>{if(dirty)setToOpen(next);else open(next);};
  const persist=()=>{
    try{
      if(initial.error)throw new Error(initial.error);
      const next=saveDraft(drafts,draft,crypto.randomUUID(),new Date().toISOString());
      localStorage.setItem(storageKey,JSON.stringify(next));setDrafts(next);edit(next[0]);setMessage("초안을 이 브라우저에 저장했어요");return true;
    }catch(error){setMessage(error instanceof Error?error.message:"초안을 저장하지 못했어요");return false;}
  };
  const remove=()=>{
    if(!toDelete)return;
    try{
      if(initial.error)throw new Error(initial.error);
      const next=drafts.filter(item=>item.id!==toDelete.id);localStorage.setItem(storageKey,JSON.stringify(next));setDrafts(next);
      if(editors[toDelete.kind].id===toDelete.id)setEditors(current=>({...current,[toDelete.kind]:newDraft(toDelete.kind,today)}));
      setToDelete(null);setMessage("초안을 삭제했어요");
    }catch{setMessage("초안을 삭제하지 못했어요 브라우저 저장 공간을 확인해 주세요");}
  };
  const download=async()=>{
    if(exporting)return;
    try{
      validateDraft(draft);setExporting(true);
      const output=document.createElement("canvas"),result=await paintMarketingImage(output,draft);
      if(result.overflow)throw new Error(draft.matchday?"경기가 이미지 영역을 넘어요 경기 수를 줄이거나 스토리 규격을 선택해 주세요":"이미지 영역을 넘는 내용이 있어요 본문을 줄이거나 스토리 규격을 선택해 주세요");
      const blob=await new Promise<Blob|null>(resolve=>output.toBlob(resolve,imageType==="jpg"?"image/jpeg":"image/png",.95));if(!blob)throw new Error("이미지를 만들지 못했어요");
      const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`KICKON-${kind}-${draft.date||today}-${draft.format}.${imageType}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setMessage(`${imageType.toUpperCase()} 이미지를 내려받았어요`);
    }catch(error){setMessage(error instanceof Error?error.message:"이미지를 내보내지 못했어요");}finally{setExporting(false);}
  };
  return <div className="marketing-studio">
    <nav className="marketing-categories" aria-label="콘텐츠 종류">{marketingKinds.map(item=>{const Icon=icons[item.value];return <button type="button" key={item.value} aria-pressed={kind===item.value} onClick={()=>{setKind(item.value);setQuery("");}}><Icon size={21} strokeWidth={1.5} aria-hidden="true"/><span>{item.label}</span><small>{drafts.filter(draft=>draft.kind===item.value).length}</small></button>;})}</nav>
    <section className="workspace-panel marketing-compose"><div className="marketing-compose-header"><div><h3>{category.label} 제작</h3><span className="marketing-save-state">{dirty?"수정 중":saved?<><Check size={13}/>저장됨</>:"새 초안"}</span></div><div className="marketing-compose-actions"><ActionButton variant="neutralWeak" size="small" type="button" aria-label="새로 만들기" onClick={()=>requestOpen(newDraft(kind,today))}><Plus size={15} aria-hidden="true"/><span className="marketing-new-label">새로 만들기</span></ActionButton><ActionButton variant="brandSolid" size="small" type="button" disabled={!!initial.error} onClick={persist}><Save size={15} aria-hidden="true"/>초안 저장</ActionButton></div></div>
      <div className="marketing-compose-grid"><div className="marketing-form workspace-form">
        {kind==='notice'?<div className="workspace-form-field"><span>공지 유형</span><CustomSelect label="공지 유형" value={draft.matchday?'matchday':'text'} options={[{value:'matchday',label:'경기 일정'},{value:'text',label:'일반 공지'}]} onChange={value=>edit({matchday:value==='matchday'?{matches:[],footer:matchdayFooter}:undefined,...(value==='matchday'&&!draft.title?{title:'MATCH DAY',format:'story'}:{})})}/></div>:null}
        <label><span className="marketing-field-label">제목<small>{draft.title.length}/80</small></span><textarea className="marketing-title-input" rows={2} value={draft.title} maxLength={80} placeholder={draft.matchday?"MATCH DAY":marketingPlaceholders.titles[kind]} onChange={event=>field("title",event.target.value)}/></label>
        {kind==='notice'&&draft.matchday?<MatchdayEditor key={`${draft.id}:${draft.date}`} draft={draft} onChange={edit} onMessage={setMessage}/>:kind==="update"?<><div className="marketing-feature-heading"><span>업데이트 항목</span><small>{draft.features.length}/4</small></div><div className="marketing-features">{draft.features.map((feature,index)=><div className="marketing-feature" key={index}><span className="marketing-feature-number">{String(index+1).padStart(2,"0")}</span><div><label className="visually-hidden" htmlFor={`feature-title-${index}`}>업데이트 {index+1} 제목</label><input id={`feature-title-${index}`} value={feature.title} maxLength={48} placeholder={marketingPlaceholders.featureTitle} onChange={event=>edit({features:draft.features.map((item,i)=>i===index?{...item,title:event.target.value}:item)})}/><label className="visually-hidden" htmlFor={`feature-description-${index}`}>업데이트 {index+1} 설명</label><textarea id={`feature-description-${index}`} rows={2} value={feature.description} maxLength={100} placeholder={marketingPlaceholders.featureDescription} onChange={event=>edit({features:draft.features.map((item,i)=>i===index?{...item,description:event.target.value}:item)})}/></div><button type="button" className="marketing-icon-button" disabled={draft.features.length===1} aria-label={`업데이트 ${index+1} 삭제`} onClick={()=>edit({features:draft.features.filter((_,i)=>i!==index)})}><X size={15}/></button></div>)}</div><button type="button" className="marketing-add-feature" disabled={draft.features.length>=4} onClick={()=>edit({features:[...draft.features,{title:"",description:""}]})}><Plus size={15} aria-hidden="true"/>항목 추가</button><label>메모<input value={draft.memo} maxLength={48} placeholder={marketingPlaceholders.memo} onChange={event=>field("memo",event.target.value)}/></label></>:<><label><span className="marketing-field-label">{kind==="event"?"참여 안내":"공지 내용"}<small>{draft.body.length}/600</small></span><textarea rows={8} value={draft.body} maxLength={600} placeholder={marketingPlaceholders.bodies[kind==="event"?"event":"notice"]} onChange={event=>field("body",event.target.value)}/></label>{kind==="event"?<><div className="form-pair"><label>시작일<input type="date" value={draft.date} onChange={event=>field("date",event.target.value)}/></label><label>종료일<input type="date" value={draft.eventEnd} min={draft.date||undefined} onChange={event=>field("eventEnd",event.target.value)}/></label></div></>:<label>게시일<input type="date" value={draft.date} onChange={event=>field("date",event.target.value)}/></label>}</>}
      </div><div className="marketing-live-preview"><div className="marketing-preview-toolbar"><span>미리보기</span><CustomSelect label="이미지 규격" value={draft.format} options={[{value:"feed",label:"피드 4:5"},{value:"story",label:"스토리 9:16"}]} onChange={value=>edit({format:value as MarketingDraft["format"]})}/></div><div className="marketing-preview-stage"><canvas ref={canvas} aria-label={`킥온 ${category.label} 이미지 미리보기`}/></div><div className="marketing-preview-footer"><span>1080 × {draft.format==="feed"?"1350":"1920"} px</span><div className="marketing-export-actions"><CustomSelect label="파일 형식" value={imageType} disabled={exporting} options={[{value:"png",label:"PNG"},{value:"jpg",label:"JPG"}]} onChange={value=>setImageType(value as "png"|"jpg")}/><ActionButton variant="brandSolid" size="small" type="button" disabled={exporting||overflow} onClick={()=>void download()}><Download size={15} aria-hidden="true"/>{exporting?"이미지 만드는 중":`${imageType.toUpperCase()} 내보내기`}</ActionButton></div></div></div></div>
    </section>
    <section className="workspace-panel marketing-library"><div className="marketing-library-toolbar"><h3>저장한 {category.label}<span>{drafts.filter(item=>item.kind===kind).length}</span></h3><SearchField value={query} onChange={setQuery} placeholder="저장한 초안 검색"/></div>{visible.length?<div className="marketing-draft-grid">{visible.map(item=>{const Icon=icons[item.kind];return <article className="marketing-draft-card" key={item.id}><button type="button" className="marketing-draft-open" onClick={()=>requestOpen(item)}><div className="marketing-draft-meta"><Icon size={18} strokeWidth={1.5} aria-hidden="true"/><span>{item.format==="feed"?"피드 4:5":"스토리 9:16"}</span></div><h4>{item.title}</h4><p>{item.matchday?item.matchday.matches.map(match=>`${match.homeName} vs ${match.awayName}`).join(" · "):item.kind==="update"?item.features.filter(feature=>feature.title).map(feature=>feature.title).join(" · "):item.body}</p><span className="marketing-draft-date">{item.kind==="update"?(item.memo||"메모 없음"):(item.date||"날짜 미정")}</span></button><div className="marketing-draft-actions"><ActionButton variant="ghost" size="small" type="button" onClick={()=>requestOpen({...item,id:"",title:`${item.title.slice(0,74)} 복사본`,updatedAt:""})}><Copy size={14} aria-hidden="true"/>복제</ActionButton><button type="button" className="marketing-icon-button" aria-label={`${item.title} 초안 삭제`} onClick={()=>setToDelete(item)}><Trash2 size={15}/></button></div></article>;})}</div>:<div className="marketing-library-empty"><Empty message={query?"검색한 초안이 없어요":"저장한 초안이 없어요"}/></div>}</section>
    {toDelete?<Dialog title="초안 삭제" dismissOnBackdrop onClose={()=>setToDelete(null)}><p className="marketing-confirm-copy">‘{toDelete.title}’ 초안을 이 브라우저에서 삭제할까요?</p><div className="marketing-confirm-actions"><ActionButton variant="neutralWeak" size="small" type="button" onClick={()=>setToDelete(null)}>취소</ActionButton><ActionButton variant="brandSolid" size="small" type="button" onClick={remove}>초안 삭제</ActionButton></div></Dialog>:null}
    {toOpen?<Dialog title="작성 중인 내용이 있어요" dismissOnBackdrop onClose={()=>setToOpen(null)}><p className="marketing-confirm-copy">지금 내용을 저장한 뒤 다른 초안을 열 수 있어요</p><div className="marketing-confirm-actions"><ActionButton variant="ghost" size="small" type="button" onClick={()=>open(toOpen)}>저장하지 않고 열기</ActionButton><ActionButton variant="brandSolid" size="small" type="button" onClick={()=>{if(persist())open(toOpen);}}>저장 후 열기</ActionButton></div></Dialog>:null}
    <Feedback message={message}/>
  </div>;
}
