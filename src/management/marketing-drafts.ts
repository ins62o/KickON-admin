export type MarketingKind="update"|"event"|"notice";
export type MarketingFeature={title:string;description:string};
export type MarketingDraft={id:string;kind:MarketingKind;title:string;body:string;features:MarketingFeature[];memo:string;date:string;eventEnd:string;format:"feed"|"story";updatedAt:string};
export const marketingKinds=[{value:"update",label:"업데이트 내역",english:"UPDATE"},{value:"event",label:"이벤트",english:"EVENT"},{value:"notice",label:"공지사항",english:"NOTICE"}] as const;
export const marketingPlaceholders={titles:{update:"새로워진 킥온",event:"우리의 응원을\n함께 나눠요",notice:"킥온에서\n안내드려요"},featureTitle:"새로운 기능의 이름",featureDescription:"달라진 점을 간결하게 소개해 주세요",bodies:{event:"참여 방법과 이벤트 혜택을 적어 주세요",notice:"전달할 내용을 적어 주세요"},memo:"메모를 적어봐"} as const;
export function newDraft(kind:MarketingKind,date:string):MarketingDraft{return {id:"",kind,title:"",body:"",features:[{title:"",description:""}],memo:kind==="update"?marketingPlaceholders.memo:"",date:kind==="update"?"":date,eventEnd:"",format:"feed",updatedAt:""};}
export function parseDrafts(raw:string):MarketingDraft[]{
  try{
    const data:unknown=JSON.parse(raw);if(!Array.isArray(data))return [];
    return data.flatMap((item:unknown)=>{
      if(!item||typeof item!=="object")return [];
      const row=item as Record<string,unknown>;
      if(!["id","title","date"].every(key=>typeof row[key]==="string")||!["feed","story"].includes(String(row.format)))return [];
      const kind=row.kind??"update";
      if(!["update","event","notice"].includes(String(kind)))return [];
      const features=Array.isArray(row.features)?row.features:typeof row.items==="string"?row.items.split("\n").filter(Boolean).map(line=>{const [title,...description]=line.split("|");return {title,description:description.join("|")};}):[];
      if(!features.every(feature=>feature&&typeof feature.title==="string"&&typeof feature.description==="string"))return [];
      if(["body","memo","eventEnd","updatedAt"].some(key=>row[key]!==undefined&&typeof row[key]!=="string"))return [];
      return [{id:row.id as string,kind:kind as MarketingKind,title:row.title as string,body:row.body as string??"",features,memo:row.memo as string??(kind==="update"?(row.date as string).replaceAll("-",". "):""),date:row.date as string,eventEnd:row.eventEnd as string??"",format:row.format as MarketingDraft["format"],updatedAt:row.updatedAt as string??""}];
    });
  }catch{return [];}
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function validateDraft(draft:MarketingDraft){
  if(draft.title.trim().length<2||draft.title.length>80)throw new Error("제목을 2~80자로 입력해 주세요");
  if(draft.date&&!validDate(draft.date)||draft.eventEnd&&!validDate(draft.eventEnd))throw new Error("날짜를 확인해 주세요");
  if(draft.kind==="update"){
    const features=draft.features.filter(item=>item.title.trim()||item.description.trim());
    if(!features.length||features.length>4||features.some(item=>!item.title.trim()||item.title.length>48||item.description.length>100))throw new Error("업데이트 제목을 입력해 주세요 항목은 최대 4개까지 넣을 수 있어요");
  }else if(!draft.body.trim()||draft.body.length>600)throw new Error("내용을 1~600자로 입력해 주세요");
  if(draft.memo.length>48)throw new Error("메모를 48자 이내로 입력해 주세요");
  if(draft.kind==="event"&&draft.eventEnd&&(!draft.date||draft.eventEnd<draft.date))throw new Error("종료일은 시작일 이후로 선택해 주세요");
}
export function saveDraft(drafts:MarketingDraft[],draft:MarketingDraft,id:string,updatedAt:string){
  validateDraft(draft);
  const existing=drafts.some(item=>item.id===draft.id);
  if(!existing&&drafts.length>=50)throw new Error("초안은 최대 50개까지 저장할 수 있어요 사용하지 않는 초안을 정리해 주세요");
  return [{...draft,id:existing?draft.id:id,updatedAt},...drafts.filter(item=>item.id!==draft.id)];
}
