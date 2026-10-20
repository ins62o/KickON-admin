import {isPushKind,type PushKind} from '../management/push-model.ts';
export const pages={dashboard:"대시보드",users:"사용자",operations:"운영 관리",data:"데이터 관리"} as const;
export type Page=keyof typeof pages;
export type OperationTab="marketing"|"notices"|"inquiries"|"reports"|"community"|"attendances";
export type DataTab="monitoring"|"sync"|"push"|"fixtures"|"teams";
export function dataTabFromUrl(href:string):DataTab {
  const tab=new URL(href).searchParams.get('tab');
  if(pageFromUrl(href)!=='data')return 'monitoring';
  return ['sync','push','fixtures','teams'].includes(tab??'')?tab as DataTab:'monitoring';
}
export function teamIdFromUrl(href:string):string|null {
  const id=new URL(href).searchParams.get('team');
  return dataTabFromUrl(href)==='teams'&&id&&/^[A-Za-z0-9_-]{1,160}$/.test(id)?id:null;
}
export function pushKindFromUrl(href:string):PushKind|null {
  const kind=new URL(href).searchParams.get('push');
  return dataTabFromUrl(href)==='push'&&isPushKind(kind)?kind:null;
}
export function pushPageUrl(href:string,kind:PushKind|null=null):string {
  const url=new URL(dataPageUrl(href,'push'));
  if(kind)url.searchParams.set('push',kind);
  return url.href;
}
export function syncJobFromUrl(href:string):string|null {
  const name=new URL(href).searchParams.get('sync');
  return dataTabFromUrl(href)==='sync'&&name&&/^[A-Za-z0-9_-]{1,200}$/.test(name)?name:null;
}
export function syncPageUrl(href:string,jobName:string|null=null):string {
  const url=new URL(dataPageUrl(href,'sync'));
  if(jobName)url.searchParams.set('sync',jobName);
  return url.href;
}
export function dataPageUrl(href:string,tab:DataTab,teamId:string|null=null):string {
  const url=new URL(pageUrl(href,'data'));
  if(tab!=='monitoring')url.searchParams.set('tab',tab);
  if(tab==='teams'&&teamId)url.searchParams.set('team',teamId);
  return url.href;
}
export function operationTabFromUrl(href:string):OperationTab {
  const tab=new URL(href).searchParams.get("tab");
  return pageFromUrl(href)==="operations"&&["marketing","notices","inquiries","reports","community","attendances"].includes(tab??"")?tab as OperationTab:"community";
}

export function pageFromUrl(href:string):Page {
  const page=new URL(href).searchParams.get("page");
  return page&&Object.hasOwn(pages,page)?page as Page:"dashboard";
}
export function pageUrl(href:string,page:Page,tab:OperationTab="community"):string {
  const url=new URL(href);
  url.searchParams.delete('team');
  url.searchParams.delete('push');
  url.searchParams.delete('sync');
  if(page==="dashboard")url.searchParams.delete("page");
  else url.searchParams.set("page",page);
  if(page==="operations"&&tab!=="community")url.searchParams.set("tab",tab);
  else url.searchParams.delete("tab");
  return url.href;
}
